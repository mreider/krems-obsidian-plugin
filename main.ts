import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFolder } from 'obsidian';

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
	// TODO: Consider a more robust way to track the child process if needed

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
		initButton.addEventListener('click', async () => {
			new Notice('Initializing directory... (Not implemented yet)');
			// TODO: Implement git clone, git remote set-url
			// Validate settings.localMarkdownPath and settings.githubRepoUrl first
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

		const updateKremsButtons = () => {
			if (this.plugin.isKremsRunning) {
				startButton.setText('Krems Running');
				startButton.disabled = true;
				stopButton.disabled = false;
			} else {
				startButton.setText('Start Krems Locally');
				startButton.disabled = false;
				stopButton.disabled = true;
			}
		};
		updateKremsButtons(); // Initial state

		startButton.addEventListener('click', async () => {
			new Notice('Starting Krems... (Not implemented yet)');
			// TODO: Implement krems --run, manage child process
			// this.plugin.isKremsRunning = true; // Update state after successful start
			// updateKremsButtons();
			// Open localhost:8080
		});
		
		stopButton.addEventListener('click', async () => {
			new Notice('Stopping Krems... (Not implemented yet)');
			// TODO: Implement stopping krems process
			// this.plugin.isKremsRunning = false; // Update state
			// updateKremsButtons();
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
		
		const commitMessageInput = pushSection.createEl('input', { type: 'text', placeholder: 'Optional commit message' });
		commitMessageInput.style.width = '100%';
		commitMessageInput.style.marginBottom = '10px';

		const pushButton = pushSection.createEl('button', { text: 'Push to GitHub' });
		pushButton.addEventListener('click', async () => {
			const commitMessage = commitMessageInput.value.trim() || 'latest site version';
			new Notice(`Pushing with commit: "${commitMessage}" (Not implemented yet)`);
			// TODO: Implement git add, commit, push
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
