import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFolder } from 'obsidian';
import * as path from 'path';
import { exec, spawn, ChildProcess } from 'child_process';

// interface for settings
interface KremsObsidianPluginSettings {
	githubRepoUrl: string;
	localMarkdownPath: string;
	gitPassword?: string; // Should be a PAT
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
		// Make sure to kill any running krems process if the plugin is unloaded
		// This was relevant when local server was a feature, less so now but good practice.
		console.log('Krems Obsidian Plugin unloaded.');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_KREMS_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Helper to execute shell commands
	async execShellCommand(command: string, cwd: string, customEnv?: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
		return new Promise((resolve, reject) => {
			const env = customEnv ? { ...process.env, ...customEnv } : process.env;
			exec(command, { cwd, env }, (error, stdout, stderr) => {
				const result = { stdout: stdout.trim(), stderr: stderr.trim() };
				if (error) {
					console.error(`Command failed: ${command}\nError: ${error.message}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`);
					reject({
						message: `Command failed: ${command}. Error: ${error.message}`, // More concise message for UI
						stdout: result.stdout,
						stderr: result.stderr,
						originalError: error
					});
					return;
				}
				if (result.stderr) {
					console.warn(`Command successful but stderr present: ${command}\nStderr: ${result.stderr}`);
				}
				resolve(result);
			});
		});
	}
}

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
			initFeedbackEl.className = `krems-feedback krems-feedback-${type}`;
		};

		initButton.addEventListener('click', async () => {
			const { localMarkdownPath, githubRepoUrl } = this.plugin.settings;

			if (!localMarkdownPath || !githubRepoUrl) {
				setInitFeedback('Error: Local Markdown Directory and GitHub Repo URL must be set in plugin settings.', 'error');
				return;
			}

			// @ts-ignore
			const vaultBasePath = this.app.vault.adapter.getBasePath();
			const absoluteLocalPath = path.join(vaultBasePath, localMarkdownPath);
			
			try {
				// @ts-ignore
				const adapter = this.app.vault.adapter;
				if (await adapter.exists(absoluteLocalPath)) {
					const stat = await adapter.stat(absoluteLocalPath);
					if (stat && stat.type === 'folder') {
						const files = await adapter.list(absoluteLocalPath);
						if (files.files.length > 0 || files.folders.length > 0) {
							setInitFeedback(`Error: Directory '${localMarkdownPath}' already exists and is not empty. Please choose an empty or new directory.`, 'error');
							return;
						}
					} else if (stat) { // It exists but is not a folder
						setInitFeedback(`Error: Path '${localMarkdownPath}' exists but is not a directory.`, 'error');
						return;
					}
					// If stat is null but exists was true, it's an odd case, treat as non-existent for safety.
				}
			} catch (e) {
				console.log("Directory check for init (error likely means dir doesn't exist, which is OK for clone):", e);
			}

			initButton.disabled = true;
			setInitFeedback('Cloning krems-example repository...', 'status');

			try {
				const cloneCommand = `git clone https://github.com/mreider/krems-example "${absoluteLocalPath}"`;
				await this.plugin.execShellCommand(cloneCommand, vaultBasePath);
				setInitFeedback('Repository cloned. Setting remote URL...', 'status');

				const setRemoteCommand = `git -C "${absoluteLocalPath}" remote set-url origin "${githubRepoUrl}"`;
				await this.plugin.execShellCommand(setRemoteCommand, vaultBasePath);
				setInitFeedback('Remote URL set. Cleaning up README.md...', 'status');

				const readmePath = path.join(absoluteLocalPath, 'README.md');
				// @ts-ignore
				if (await this.app.vault.adapter.exists(readmePath)) {
					// @ts-ignore
					await this.app.vault.adapter.remove(readmePath);
					setInitFeedback('Directory initialized successfully! README.md removed.', 'success');
				} else {
					setInitFeedback('Directory initialized successfully! (README.md not found to remove).', 'success');
				}
			} catch (error: any) {
				console.error('Initialization error:', error);
				const errorMsg = error.stderr || error.message || error.toString();
				setInitFeedback(`Initialization failed: ${errorMsg}`, 'error');
			} finally {
				initButton.disabled = false;
			}
		});

		if (!this.plugin.settings.localMarkdownPath || !this.plugin.settings.githubRepoUrl) {
			initButton.disabled = true;
			initSection.createEl('p', {text: 'Please set Local Markdown Directory and GitHub Repo URL in settings.', cls: 'krems-warning'});
		}

		// --- Push Site to Repo ---
		const pushSection = contentEl.createDiv({ cls: 'krems-modal-section' });
		pushSection.createEl('h4', { text: '2. Push Site to GitHub' }); // Renumbered
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
			const { localMarkdownPath, githubRepoUrl, gitAuthorName, gitAuthorEmail, gitPassword } = this.plugin.settings;

			if (!localMarkdownPath || !githubRepoUrl) {
				setPushFeedback('Error: Local Markdown Directory and GitHub Repo URL must be set in plugin settings.', 'error');
				return;
			}
			
			// @ts-ignore
			const vaultBasePath = this.app.vault.adapter.getBasePath();
			const absoluteLocalPath = path.join(vaultBasePath, localMarkdownPath);

			const commitMessage = commitMessageInput.value.trim() || 'latest site version';
			const sanitizedCommitMessage = commitMessage.replace(/"/g, '\\"');

			pushButton.disabled = true;
			commitMessageInput.disabled = true;
			setPushFeedback('Preparing to push site...', 'status');

			try {
				let cmdOutput;

				setPushFeedback('Adding files (git add .)...', 'status');
				cmdOutput = await this.plugin.execShellCommand('git add .', absoluteLocalPath);
				if (cmdOutput.stderr) { setPushFeedback(`Git add warning: ${cmdOutput.stderr}`, 'status');}


				setPushFeedback(`Committing with message: "${sanitizedCommitMessage}"...`, 'status');
				const authorNameForCommit = gitAuthorName || "Krems Obsidian Plugin";
				const authorEmailForCommit = gitAuthorEmail || "krems-plugin@example.com";
				
				const commitEnv: NodeJS.ProcessEnv = {
					GIT_AUTHOR_NAME: authorNameForCommit,
					GIT_AUTHOR_EMAIL: authorEmailForCommit,
					GIT_COMMITTER_NAME: authorNameForCommit,
					GIT_COMMITTER_EMAIL: authorEmailForCommit
				};

				try {
					cmdOutput = await this.plugin.execShellCommand(`git commit -m "${sanitizedCommitMessage}"`, absoluteLocalPath, commitEnv);
					if (cmdOutput.stderr) { setPushFeedback(`Git commit warning: ${cmdOutput.stderr}`, 'status');}
				} catch (commitError: any) {
					if (commitError.stderr && commitError.stderr.includes("nothing to commit")) {
						setPushFeedback('No changes to commit. Proceeding to push...', 'status');
					} else {
						throw commitError; // Re-throw other commit errors
					}
				}
				
				setPushFeedback('Pushing to remote repository...', 'status');
				let pushCommand = 'git push';
				
				if (gitPassword && githubRepoUrl.startsWith('https://')) {
					const urlWithoutProtocol = githubRepoUrl.substring('https://'.length);
					const authenticatedUrl = `https://${gitPassword}@${urlWithoutProtocol}`;
					
					let currentBranch = 'main';
					try {
						cmdOutput = await this.plugin.execShellCommand('git rev-parse --abbrev-ref HEAD', absoluteLocalPath);
						currentBranch = cmdOutput.stdout;
						if (cmdOutput.stderr) { setPushFeedback(`Git branch warning: ${cmdOutput.stderr}`, 'status');}
					} catch (branchError: any) {
						console.warn("Could not determine current branch, defaulting to 'main'. Error:", branchError.message);
						setPushFeedback(`Warning: Could not determine current branch (using 'main'). Details: ${branchError.stderr || branchError.message}`, 'status');
					}
					pushCommand = `git push ${authenticatedUrl} ${currentBranch}`;
					setPushFeedback(`Pushing to ${githubRepoUrl} (authenticated)...`, 'status');
				} else {
					setPushFeedback(`Pushing to ${githubRepoUrl} (unauthenticated, ensure credential helper or SSH is set up)...`, 'status');
				}
				
				cmdOutput = await this.plugin.execShellCommand(pushCommand, absoluteLocalPath);
				if (cmdOutput.stderr) { 
					setPushFeedback(`Push successful with warnings: ${cmdOutput.stderr}`, 'success');
				} else {
					setPushFeedback('Site pushed successfully!', 'success');
				}

			} catch (error: any) {
				console.error('Push error:', error);
				const errorMsg = `Push failed: ${error.message || error.toString()}${error.stderr ? `\nStderr: ${error.stderr}` : ''}`;
				setPushFeedback(errorMsg, 'error');
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

		const setFeedback = (inputEl: HTMLInputElement, feedbackDiv: HTMLElement, message: string, isValid: boolean) => {
			inputEl.classList.remove('krems-input-valid', 'krems-input-invalid');
			feedbackDiv.classList.remove('krems-feedback-valid', 'krems-feedback-invalid');
			
			feedbackDiv.textContent = message;
			feedbackDiv.style.display = message ? 'block' : 'none';

			if (message) {
				inputEl.classList.add(isValid ? 'krems-input-valid' : 'krems-input-invalid');
				feedbackDiv.classList.add(isValid ? 'krems-feedback-valid' : 'krems-feedback-invalid');
			}
		};
		
		new Setting(containerEl)
			.setName('GitHub Repository URL')
			.setDesc('HTTPS URL of your GitHub repository (e.g., https://github.com/username/repo). Do not include .git at the end.')
			.addText(text => {
				const feedbackEl = text.inputEl.parentElement?.createEl('div', { cls: 'krems-setting-feedback', attr: { style: 'display: none; margin-top: 5px;' }}) as HTMLElement;
				text.setPlaceholder('https://github.com/username/repo')
					.setValue(this.plugin.settings.githubRepoUrl)
					.onChange(async (value) => {
						this.plugin.settings.githubRepoUrl = value.trim();
						await this.plugin.saveSettings();
					});

				text.inputEl.addEventListener('focusout', async () => {
					const value = this.plugin.settings.githubRepoUrl;
					let isValid = true;
					let message = '';
					if (!value) {
						setFeedback(text.inputEl, feedbackEl, '', true); return;
					}
					if (!value.startsWith('https://github.com/')) {
						isValid = false; message = 'URL must start with https://github.com/';
					} else if (value.endsWith('.git')) {
						isValid = false; message = 'URL should not end with .git';
					} else {
						const parts = value.substring('https://github.com/'.length).split('/');
						if (parts.length < 2 || !parts[0] || !parts[1]) {
							isValid = false; message = 'Invalid GitHub repository URL format.';
						}
					}
					if (isValid && message === '') message = 'URL format is valid.';
					setFeedback(text.inputEl, feedbackEl, message, isValid);
				});
				if (this.plugin.settings.githubRepoUrl) text.inputEl.dispatchEvent(new Event('focusout'));
			});

		new Setting(containerEl)
			.setName('Local Markdown Directory')
			.setDesc('Path to the directory in your vault for your Krems site (e.g., MyKremsSite).')
			.addText(text => {
				const feedbackEl = text.inputEl.parentElement?.createEl('div', { cls: 'krems-setting-feedback', attr: { style: 'display: none; margin-top: 5px;' }}) as HTMLElement;
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
						setFeedback(text.inputEl, feedbackEl, '', true); return;
					}
					// @ts-ignore
					const abstractFile = this.app.vault.getAbstractFileByPath(value);
					if (abstractFile && abstractFile instanceof TFolder) {
						isValid = true; message = 'Directory exists.';
					} else {
						isValid = false; message = 'Directory not found in the vault.';
					}
					setFeedback(text.inputEl, feedbackEl, message, isValid);
				});
				if (this.plugin.settings.localMarkdownPath) text.inputEl.dispatchEvent(new Event('focusout'));
			});

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

		new Setting(containerEl)
			.setName('Git Author Name')
			.setDesc('Name to use for Git commits (e.g., Your Name). If blank, a default ("Krems Obsidian Plugin") will be used.')
			.addText(text => text
				.setPlaceholder('Your Name')
				.setValue(this.plugin.settings.gitAuthorName || '')
				.onChange(async (value) => {
					this.plugin.settings.gitAuthorName = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Git Author Email')
			.setDesc('Email to use for Git commits (e.g., your.email@example.com). If blank, a default ("krems-plugin@example.com") will be used.')
			.addText(text => text
				.setPlaceholder('your.email@example.com')
				.setValue(this.plugin.settings.gitAuthorEmail || '')
				.onChange(async (value) => {
					this.plugin.settings.gitAuthorEmail = value.trim();
					await this.plugin.saveSettings();
				}));
		
		containerEl.createEl('hr');
		const instructionsLinkPara = containerEl.createEl('p', { cls: 'krems-settings-footer' });
		instructionsLinkPara.setText('For plugin instructions, troubleshooting, and more information, please visit the ');
		instructionsLinkPara.createEl('a', {
			text: 'plugin documentation on GitHub',
			href: 'https://github.com/mreider/krems-obsidian-plugin/',
			attr: { target: '_blank', rel: 'noopener noreferrer' }
		});
		instructionsLinkPara.appendText('.');
	}
}
