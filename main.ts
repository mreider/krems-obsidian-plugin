import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFolder } from 'obsidian';
import * as path from 'path';
import { exec, spawn, ChildProcess } from 'child_process';

// interface for settings
interface KremsObsidianPluginSettings {
	githubRepoUrl: string;
	localMarkdownPath: string;
	gitPassword?: string;
	gitAuthorName?: string;
	gitAuthorEmail?: string;
}

const DEFAULT_KREMS_SETTINGS: KremsObsidianPluginSettings = {
	githubRepoUrl: '',
	localMarkdownPath: '',
	gitPassword: '',
	gitAuthorName: '',
	gitAuthorEmail: '',
}

export default class KremsObsidianPlugin extends Plugin {
	settings: KremsObsidianPluginSettings;
	// isKremsRunning and kremsProcess removed as local server functionality is being removed

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
	async execShellCommand(command: string, cwd: string, customEnv?: NodeJS.ProcessEnv): Promise<string> {
		return new Promise((resolve, reject) => {
			const env = customEnv ? { ...process.env, ...customEnv } : process.env;
			exec(command, { cwd, env }, (error, stdout, stderr) => {
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
				setInitFeedback('Remote URL set. Cleaning up README.md...', 'status');

				// Delete README.md from the cloned directory
				const readmePath = path.join(absoluteLocalPath, 'README.md');
				// @ts-ignore
				if (await this.app.vault.adapter.exists(readmePath)) {
					// @ts-ignore
					await this.app.vault.adapter.remove(readmePath);
					setInitFeedback('Directory initialized successfully! README.md removed.', 'success');
				} else {
					setInitFeedback('Directory initialized successfully! (README.md not found to remove).', 'success');
				}

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

		// --- Run Krems Locally functionality removed ---

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
				
				const authorName = this.plugin.settings.gitAuthorName || "Krems Obsidian Plugin";
				const authorEmail = this.plugin.settings.gitAuthorEmail || "krems-plugin@example.com";
				
				const commitEnv: NodeJS.ProcessEnv = {
					GIT_AUTHOR_NAME: authorName,
					GIT_AUTHOR_EMAIL: authorEmail,
					GIT_COMMITTER_NAME: authorName,
					GIT_COMMITTER_EMAIL: authorEmail
				};

				try {
					await this.plugin.execShellCommand(`git commit -m "${sanitizedCommitMessage}"`, absoluteLocalPath, commitEnv);
				} catch (commitError: any) {
					if (commitError.toString().includes("nothing to commit")) {
						setPushFeedback('No changes to commit. Proceeding to push...', 'status');
					} else {
						throw commitError; // Re-throw other commit errors
					}
				}
				
				setPushFeedback('Pushing to remote repository...', 'status');
				let pushCommand = 'git push';
				const { gitPassword, githubRepoUrl: originalRepoUrl } = this.plugin.settings;

				if (gitPassword && originalRepoUrl.startsWith('https://')) {
					// Construct authenticated URL: https://<TOKEN>@github.com/user/repo
					// Need to strip "https://" from originalRepoUrl first
					const urlWithoutProtocol = originalRepoUrl.substring('https://'.length);
					const authenticatedUrl = `https://${gitPassword}@${urlWithoutProtocol}`;
					// It's generally better to push to a named remote and branch,
					// but for simplicity, if the remote 'origin' is set to the user's repo,
					// this will push the current branch to its upstream.
					// A more robust way is to specify the remote and branch:
					// pushCommand = `git push ${authenticatedUrl} HEAD`; // Pushes current branch to remote default
					// Or, assuming 'origin' is correctly set by the init step:
					// First, ensure origin is set to the non-authenticated URL
					// Then, use the authenticated URL for this specific push command.
					// This avoids storing the token in the .git/config permanently.
					// The `git push <authenticated_url> <branch>` is a good way.
					// Let's assume we want to push the current branch to its counterpart on the remote.
					// A simple `git push` should use the origin. If origin needs auth, this is one way.
					// We need to ensure the branch name. For now, let's assume 'main' or current.
					// The command `git push https://TOKEN@host/path/to/repo.git localBranch:remoteBranch`
					
					// Get current branch name
					let currentBranch = 'main'; // Default
					try {
						currentBranch = await this.plugin.execShellCommand('git rev-parse --abbrev-ref HEAD', absoluteLocalPath);
					} catch (branchError) {
						console.warn("Could not determine current branch, defaulting to 'main'. Error:", branchError);
						setPushFeedback('Warning: Could not determine current branch, attempting to push to "main".', 'status');
					}
					pushCommand = `git push ${authenticatedUrl} ${currentBranch}`;
					setPushFeedback(`Pushing to ${originalRepoUrl} with authentication...`, 'status');
				} else {
					setPushFeedback(`Pushing to ${originalRepoUrl} (no token/password provided or not HTTPS URL)...`, 'status');
					// Default push command relies on system's credential manager or SSH keys if remote is SSH
				}
				
				await this.plugin.execShellCommand(pushCommand, absoluteLocalPath);
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

		// 3. GitHub Personal Access Token (PAT) Setting
		new Setting(containerEl)
			.setName('GitHub Personal Access Token (PAT)')
			.setDesc('Required for pushing to HTTPS repositories. Create a PAT on GitHub with "repo" scope. See plugin README for instructions.')
			.addText(text => {
				text.inputEl.type = 'password';
				text.setPlaceholder('Enter your GitHub PAT')
					.setValue(this.plugin.settings.gitPassword || '')
					.onChange(async (value) => {
						this.plugin.settings.gitPassword = value;
						await this.plugin.saveSettings();
					});
			});

		// Git Author Name Setting
		new Setting(containerEl)
			.setName('Git Author Name')
			.setDesc('Name to use for Git commits (e.g., Your Name). If blank, a default will be used.')
			.addText(text => text
				.setPlaceholder('Your Name')
				.setValue(this.plugin.settings.gitAuthorName || '')
				.onChange(async (value) => {
					this.plugin.settings.gitAuthorName = value.trim();
					await this.plugin.saveSettings();
				}));

		// Git Author Email Setting
		new Setting(containerEl)
			.setName('Git Author Email')
			.setDesc('Email to use for Git commits (e.g., your.email@example.com). If blank, a default will be used.')
			.addText(text => text
				.setPlaceholder('your.email@example.com')
				.setValue(this.plugin.settings.gitAuthorEmail || '')
				.onChange(async (value) => {
					this.plugin.settings.gitAuthorEmail = value.trim();
					await this.plugin.saveSettings();
				}));
		
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
