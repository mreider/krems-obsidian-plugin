import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFolder } from 'obsidian';
import * as path from 'path';
import { exec, spawn, ChildProcess } from 'child_process';

// interface for settings
interface KremsObsidianPluginSettings {
	githubRepoUrl: string;
	localMarkdownPath: string;
	gitPassword?: string;
}

const DEFAULT_KREMS_SETTINGS: KremsObsidianPluginSettings = {
	githubRepoUrl: '',
	localMarkdownPath: '',
	gitPassword: '',
}

export default class KremsObsidianPlugin extends Plugin {
	settings: KremsObsidianPluginSettings;
	isKremsRunning: boolean = false; // To track Krems server state
	kremsProcess: ChildProcess | null = null; // To hold the spawned Krems process

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('cloud-lightning', 'Krems Publisher', (evt: MouseEvent) => {
			new ActionModal(this.app, this).open();
		});

		this.addSettingTab(new KremsSettingTab(this.app, this));
		console.log('Krems Obsidian Plugin loaded.');
	}

	onunload() {
		console.log('Krems Obsidian Plugin unloaded.');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_KREMS_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Helper to execute shell commands
	async execShellCommand(command: string, cwd: string): Promise<string> {
		return new Promise((resolve, reject) => {
			exec(command, { cwd }, (error, stdout, stderr) => {
				if (error) {
					console.error(`exec error: ${error.message}`);
					reject(`Error: ${error.message}\nStderr: ${stderr}`);
					return;
				}
				if (stderr) {
					// Sometimes commands output to stderr for non-error info (e.g., git clone progress)
					// For simplicity here, we'll log it but still resolve if no error object.
					// A more robust solution might inspect stderr more closely.
					console.warn(`exec stderr: ${stderr}`);
				}
				resolve(stdout.trim());
			});
		});
	}
}

// Placeholder for ActionModal - to be implemented later
class ActionModal extends Modal {
	plugin: KremsObsidianPlugin;

	constructor(app: App, plugin: KremsObsidianPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Krems Publisher Actions' });

		// --- Initialize Local Directory ---
		const initSection = contentEl.createDiv({ cls: 'krems-modal-section' });
		initSection.createEl('h4', { text: '1. Initialize Local Directory' });
		initSection.createEl('p', { text: `This will clone krems-example into your specified local directory (${this.plugin.settings.localMarkdownPath || 'not set'}) and set its remote to your GitHub repo.`});
		const initButton = initSection.createEl('button', { text: 'Initialize Directory' });
		const initFeedbackEl = initSection.createEl('div', { cls: 'krems-feedback', attr: { style: 'margin-top: 10px;' } });

		const setInitFeedback = (message: string, type: 'status' | 'success' | 'error') => {
			initFeedbackEl.textContent = message;
			initFeedbackEl.className = `krems-feedback krems-feedback-${type}`; // Use CSS classes for styling
		};

		initButton.addEventListener('click', async () => {
			const { localMarkdownPath, githubRepoUrl } = this.plugin.settings;

			if (!localMarkdownPath || !githubRepoUrl) {
				setInitFeedback('Error: Local Markdown Directory and GitHub Repo URL must be set in plugin settings.', 'error');
				return;
			}

			// @ts-ignore (Obsidian specific, path might not be recognized by TS alone)
			const vaultBasePath = this.app.vault.adapter.getBasePath();
			const absoluteLocalPath = path.join(vaultBasePath, localMarkdownPath);
			
			// Check if directory already exists and is not empty (simple check)
			try {
				// @ts-ignore
				const adapter = this.app.vault.adapter;
				if (await adapter.exists(absoluteLocalPath)) {
					const stat = await adapter.stat(absoluteLocalPath);
					if (stat && stat.type === 'folder') { // Added null check for stat
						const files = await adapter.list(absoluteLocalPath);
						if (files.files.length > 0 || files.folders.length > 0) {
							setInitFeedback(`Error: Directory '${localMarkdownPath}' already exists and is not empty. Please choose an empty or new directory.`, 'error');
							return;
						}
					} else {
						setInitFeedback(`Error: Path '${localMarkdownPath}' exists but is not a directory.`, 'error');
						return;
					}
				}
			} catch (e) {
				// If stat fails, directory likely doesn't exist, which is fine for clone
				console.log("Directory check for init:", e);
			}


			initButton.disabled = true;
			setInitFeedback('Cloning krems-example repository...', 'status');

			try {
				const cloneCommand = `git clone https://github.com/mreider/krems-example "${absoluteLocalPath}"`;
				// Note: For git clone, the CWD should be a directory *outside* the one being created.
				// We'll use the vault base path as a safe CWD for the clone command itself.
				await this.plugin.execShellCommand(cloneCommand, vaultBasePath);
				setInitFeedback('Repository cloned. Setting remote URL...', 'status');

				const setRemoteCommand = `git -C "${absoluteLocalPath}" remote set-url origin "${githubRepoUrl}"`;
				// For this command, CWD can be anything as -C specifies the target repo.
				// Using vaultBasePath again for consistency.
				await this.plugin.execShellCommand(setRemoteCommand, vaultBasePath);
				setInitFeedback('Directory initialized successfully!', 'success');

			} catch (error) {
				console.error('Initialization error:', error);
				setInitFeedback(`Initialization failed: ${error}`, 'error');
			} finally {
				initButton.disabled = false;
			}
		});

		if (!this.plugin.settings.localMarkdownPath || !this.plugin.settings.githubRepoUrl) {
			initButton.disabled = true;
			initSection.createEl('p', {text: 'Please set Local Markdown Directory and GitHub Repo URL in settings.', cls: 'krems-warning'});
		}

		// --- Run Krems Locally ---
		const runSection = contentEl.createDiv({ cls: 'krems-modal-section' });
		runSection.createEl('h4', { text: '2. Manage Local Krems Server' });
		
		const startButton = runSection.createEl('button', { text: 'Start Krems Locally' });
		const stopButton = runSection.createEl('button', { text: 'Stop Krems Server' });
		const kremsRunFeedbackEl = runSection.createEl('div', { cls: 'krems-feedback', attr: { style: 'margin-top: 10px; white-space: pre-wrap; background-color: var(--background-secondary); padding: 5px; border-radius: 3px; max-height: 150px; overflow-y: auto;' } });

		const setKremsRunFeedback = (message: string, type: 'status' | 'success' | 'error' | 'log') => {
			if (type === 'log') {
				kremsRunFeedbackEl.textContent += message + '\n'; // Append logs
				kremsRunFeedbackEl.scrollTop = kremsRunFeedbackEl.scrollHeight; // Scroll to bottom
			} else {
				kremsRunFeedbackEl.textContent = message; // Overwrite for status/error/success
			}
			kremsRunFeedbackEl.className = `krems-feedback krems-feedback-${type}`;
		};
		
		const updateKremsButtons = () => {
			if (this.plugin.isKremsRunning) {
				startButton.setText('Krems Server Running');
				startButton.disabled = true;
				stopButton.disabled = false;
			} else {
				startButton.setText('Start Krems Locally');
				startButton.disabled = false;
				stopButton.disabled = true;
				// Optionally clear kremsRunFeedbackEl when not running or on explicit stop
			}
		};
		updateKremsButtons(); // Initial state

		startButton.addEventListener('click', async () => {
			const { localMarkdownPath } = this.plugin.settings;
			if (!localMarkdownPath) {
				setKremsRunFeedback('Error: Local Markdown Directory must be set in plugin settings.', 'error');
				return;
			}
			if (this.plugin.isKremsRunning || this.plugin.kremsProcess) {
				setKremsRunFeedback('Krems is already running or process exists.', 'status');
				return;
			}

			// @ts-ignore
			const vaultBasePath = this.app.vault.adapter.getBasePath();
			const absoluteLocalPath = path.join(vaultBasePath, localMarkdownPath);

			setKremsRunFeedback('Starting Krems server...', 'status');
			startButton.disabled = true; // Disable while attempting to start

			try {
				// Ensure the 'krems' command is available. This might need to be configurable or use a bundled krems.
				// For now, assuming 'krems' is in PATH or a full path is provided/discovered.
				// A better approach for production would be to bundle Krems or have a clear path setting for it.
				this.plugin.kremsProcess = spawn('krems', ['--run'], { cwd: absoluteLocalPath, shell: true });
				this.plugin.isKremsRunning = true;
				updateKremsButtons();
				setKremsRunFeedback('Krems server started. Output:\n', 'log'); // Initial log message
				window.open('http://localhost:8080', '_blank');


				this.plugin.kremsProcess.stdout?.on('data', (data) => {
					setKremsRunFeedback(data.toString(), 'log');
				});

				this.plugin.kremsProcess.stderr?.on('data', (data) => {
					// Krems might output normal status to stderr too
					setKremsRunFeedback(`[STDERR] ${data.toString()}`, 'log');
				});

				this.plugin.kremsProcess.on('error', (err) => {
					console.error('Failed to start Krems process:', err);
					setKremsRunFeedback(`Failed to start Krems: ${err.message}`, 'error');
					this.plugin.isKremsRunning = false;
					this.plugin.kremsProcess = null;
					updateKremsButtons();
				});

				this.plugin.kremsProcess.on('close', (code) => {
					setKremsRunFeedback(`Krems server exited with code ${code}.`, code === 0 ? 'status' : 'error');
					this.plugin.isKremsRunning = false;
					this.plugin.kremsProcess = null;
					updateKremsButtons();
				});

			} catch (error) {
				console.error('Error spawning Krems:', error);
				setKremsRunFeedback(`Error starting Krems: ${error}`, 'error');
				this.plugin.isKremsRunning = false; // Ensure state is correct on error
				this.plugin.kremsProcess = null;
				updateKremsButtons(); // Re-enable start button if failed
			}
		});
		
		stopButton.addEventListener('click', async () => {
			if (this.plugin.kremsProcess) {
				setKremsRunFeedback('Stopping Krems server...', 'status');
				this.plugin.kremsProcess.kill(); // SIGTERM by default
				// 'close' event handler above will update state and buttons.
				// Forcing state here can be problematic if kill fails or is slow.
				// Let the 'close' event handle the final state update.
			} else {
				setKremsRunFeedback('Krems server is not running.', 'status');
				this.plugin.isKremsRunning = false; // Ensure consistency
				updateKremsButtons();
			}
		});

		if (!this.plugin.settings.localMarkdownPath) {
			startButton.disabled = true;
			stopButton.disabled = true;
			runSection.createEl('p', {text: 'Please set Local Markdown Directory in settings.', cls: 'krems-warning'});
		}


		// --- Push Site to Repo ---
		const pushSection = contentEl.createDiv({ cls: 'krems-modal-section' });
		pushSection.createEl('h4', { text: '3. Push Site to GitHub' });
		pushSection.createEl('p', { text: `This will add, commit, and push the content of '${this.plugin.settings.localMarkdownPath || 'not set'}' to your GitHub repo.`});
		
		const commitMessageInput = pushSection.createEl('input', { type: 'text', placeholder: 'Optional commit message (default: latest site version)' });
		commitMessageInput.style.width = '100%';
		commitMessageInput.style.marginBottom = '10px';

		const pushButton = pushSection.createEl('button', { text: 'Push to GitHub' });
		const pushFeedbackEl = pushSection.createEl('div', { cls: 'krems-feedback', attr: { style: 'margin-top: 10px;' } });

		const setPushFeedback = (message: string, type: 'status' | 'success' | 'error') => {
			pushFeedbackEl.textContent = message;
			pushFeedbackEl.className = `krems-feedback krems-feedback-${type}`;
		};

		pushButton.addEventListener('click', async () => {
			const { localMarkdownPath, githubRepoUrl } = this.plugin.settings;

			if (!localMarkdownPath || !githubRepoUrl) {
				setPushFeedback('Error: Local Markdown Directory and GitHub Repo URL must be set in plugin settings.', 'error');
				return;
			}
			
			// @ts-ignore
			const vaultBasePath = this.app.vault.adapter.getBasePath();
			const absoluteLocalPath = path.join(vaultBasePath, localMarkdownPath);

			const commitMessage = commitMessageInput.value.trim() || 'latest site version';
			// Sanitize commit message to prevent command injection issues if it were ever used unsafely (though here it's an arg)
			const sanitizedCommitMessage = commitMessage.replace(/"/g, '\\"');


			pushButton.disabled = true;
			commitMessageInput.disabled = true;
			setPushFeedback('Preparing to push site...', 'status');

			try {
				setPushFeedback('Adding files (git add .)...', 'status');
				await this.plugin.execShellCommand('git add .', absoluteLocalPath);

				setPushFeedback(`Committing with message: "${sanitizedCommitMessage}"...`, 'status');
				// Need to handle cases where there's nothing to commit.
				// `git commit` will error if there are no changes staged.
				// A more robust solution checks `git status` first or allows empty commits if desired.
				// For now, we'll try to commit and catch the error if nothing to commit.
				try {
					await this.plugin.execShellCommand(`git commit -m "${sanitizedCommitMessage}"`, absoluteLocalPath);
				} catch (commitError: any) {
					if (commitError.toString().includes("nothing to commit")) {
						setPushFeedback('No changes to commit. Proceeding to push...', 'status');
					} else {
						throw commitError; // Re-throw other commit errors
					}
				}
				
				setPushFeedback('Pushing to remote repository...', 'status');
				await this.plugin.execShellCommand('git push', absoluteLocalPath);
				setPushFeedback('Site pushed successfully!', 'success');

			} catch (error) {
				console.error('Push error:', error);
				setPushFeedback(`Push failed: ${error}`, 'error');
			} finally {
				pushButton.disabled = false;
				commitMessageInput.disabled = false;
			}
		});

		if (!this.plugin.settings.localMarkdownPath || !this.plugin.settings.githubRepoUrl) {
			pushButton.disabled = true;
			commitMessageInput.disabled = true;
			pushSection.createEl('p', {text: 'Please set Local Markdown Directory and GitHub Repo URL in settings.', cls: 'krems-warning'});
		}

		contentEl.createEl('hr');
		const helpLink = contentEl.createEl('p', {cls: 'krems-modal-footer'});
		helpLink.setText('For help, see the ');
		helpLink.createEl('a', {
			text: 'plugin documentation',
			href: 'https://github.com/mreider/krems-obsidian-plugin/',
			attr: { target: '_blank', rel: 'noopener noreferrer' }
		});
		helpLink.appendText('.');

	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class KremsSettingTab extends PluginSettingTab {
	plugin: KremsObsidianPlugin;

	constructor(app: App, plugin: KremsObsidianPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'Krems Publisher Settings'});

		// Updated helper function to display validation feedback
		const setFeedback = (inputEl: HTMLInputElement, feedbackDiv: HTMLElement, message: string, isValid: boolean) => {
			inputEl.classList.remove('krems-input-valid', 'krems-input-invalid');
			feedbackDiv.classList.remove('krems-feedback-valid', 'krems-feedback-invalid'); // Ensure classes are on the feedback div
			
			feedbackDiv.textContent = message;
			feedbackDiv.style.display = message ? 'block' : 'none'; // Show/hide feedback div

			if (message) {
				inputEl.classList.add(isValid ? 'krems-input-valid' : 'krems-input-invalid');
				feedbackDiv.classList.add(isValid ? 'krems-feedback-valid' : 'krems-feedback-invalid');
			}
		};
		
		// 1. GitHub Repository URL Setting
		const repoUrlSetting = new Setting(containerEl)
			.setName('GitHub Repository URL')
			.setDesc('HTTPS URL of your GitHub repository (e.g., https://github.com/username/repo). Do not include .git at the end.');
		
		// Create feedback element directly within the setting's control element
		const repoUrlFeedbackEl = repoUrlSetting.controlEl.createEl('div', {
			cls: 'krems-setting-feedback', // General class for styling all feedback messages
			attr: { id: 'repo-url-feedback', style: 'display: none; margin-top: 5px;' } // Initially hidden
		});
		
		repoUrlSetting.addText(text => {
			text.setPlaceholder('https://github.com/username/repo')
				.setValue(this.plugin.settings.githubRepoUrl)
				.onChange(async (value) => {
					this.plugin.settings.githubRepoUrl = value.trim();
					await this.plugin.saveSettings();
					// Immediate validation can be noisy, focusout is better
				});

			text.inputEl.addEventListener('focusout', async () => {
				const value = this.plugin.settings.githubRepoUrl;
				let isValid = true;
				let message = '';

				if (!value) {
					// Allow empty if user doesn't want to use this feature yet
					setFeedback(text.inputEl, repoUrlFeedbackEl, '', true);
					return;
				}

				if (!value.startsWith('https://github.com/')) {
					isValid = false;
					message = 'URL must start with https://github.com/';
				} else if (value.endsWith('.git')) {
					isValid = false;
					message = 'URL should not end with .git';
				} else {
					// Basic check for structure like https://github.com/user/repo
					const parts = value.substring('https://github.com/'.length).split('/');
					if (parts.length < 2 || !parts[0] || !parts[1]) {
						isValid = false;
						message = 'Invalid GitHub repository URL format.';
					}
				}
				
				if (isValid && message === '') message = 'URL format is valid.';
				setFeedback(text.inputEl, repoUrlFeedbackEl, message, isValid);
			});
			// Trigger initial validation if value exists
			if (this.plugin.settings.githubRepoUrl) {
				text.inputEl.dispatchEvent(new Event('focusout'));
			}
		});

		// 2. Local Markdown Directory Setting
		const localPathSetting = new Setting(containerEl)
			.setName('Local Markdown Directory')
			.setDesc('Path to the directory in your vault for your Krems site (e.g., MyKremsSite).');

		// Create feedback element directly within the setting's control element
		const localPathFeedbackEl = localPathSetting.controlEl.createEl('div', {
			cls: 'krems-setting-feedback',
			attr: { id: 'local-path-feedback', style: 'display: none; margin-top: 5px;' } // Initially hidden
		});

		localPathSetting.addText(text => {
			text.setPlaceholder('e.g., MyKremsSite or path/to/site')
				.setValue(this.plugin.settings.localMarkdownPath)
				.onChange(async (value) => {
					this.plugin.settings.localMarkdownPath = value.trim();
					await this.plugin.saveSettings();
				});

			text.inputEl.addEventListener('focusout', async () => {
				const value = this.plugin.settings.localMarkdownPath;
				let isValid = false;
				let message = '';

				if (!value) {
					setFeedback(text.inputEl, localPathFeedbackEl, '', true); // Allow empty
					return;
				}
				
				const abstractFile = this.app.vault.getAbstractFileByPath(value);
				if (abstractFile && abstractFile instanceof TFolder) {
					isValid = true;
					message = 'Directory exists.';
				} else {
					isValid = false;
					message = 'Directory not found in the vault.';
				}
				setFeedback(text.inputEl, localPathFeedbackEl, message, isValid);
			});
			if (this.plugin.settings.localMarkdownPath) {
				text.inputEl.dispatchEvent(new Event('focusout'));
			}
		});

		// 3. Git Token/Password Setting
		new Setting(containerEl)
			.setName('Git Token/Password (Optional)')
			.setDesc('Enter your Git password or Personal Access Token (PAT) if required for push operations. PAT is recommended for security.')
			.addText(text => {
				text.inputEl.type = 'password';
				text.setPlaceholder('Enter your Git token/password')
					.setValue(this.plugin.settings.gitPassword || '')
					.onChange(async (value) => {
						this.plugin.settings.gitPassword = value;
						await this.plugin.saveSettings();
					});
			});
		
		// 9. Link to instructions
		containerEl.createEl('hr');
		const instructionsLinkPara = containerEl.createEl('p', { cls: 'krems-settings-footer' });
		instructionsLinkPara.setText('For plugin instructions, troubleshooting, and more information, please visit the ');
		instructionsLinkPara.createEl('a', {
			text: 'plugin documentation on GitHub',
			href: 'https://github.com/mreider/krems-obsidian-plugin/',
			attr: { target: '_blank', rel: 'noopener noreferrer' }
		});
		instructionsLinkPara.setText('.');
	}
}
