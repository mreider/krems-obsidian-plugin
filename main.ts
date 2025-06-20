import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFolder, requestUrl } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs'; // Import 'fs' for chmodSync and createWriteStream
import { exec, spawn, ChildProcess } from 'child_process';

// interface for settings
interface KremsObsidianPluginSettings {
	githubRepoUrl: string;
	localMarkdownPath: string;
	gitPassword?: string; // Should be a PAT
	gitAuthorName?: string;
	gitAuthorEmail?: string;
	localRunPort?: string; // Stored as string, validated as number
	localKremsBinaryPath?: string; // Path to downloaded krems binary
	alternativeCSSDir?: string;
	alternativeJSDir?: string;
	alternativeFavicon?: string;
}

const DEFAULT_KREMS_SETTINGS: KremsObsidianPluginSettings = {
	githubRepoUrl: '',
	localMarkdownPath: '',
	gitPassword: '',
	gitAuthorName: '',
	gitAuthorEmail: '',
	localRunPort: '8080',
	localKremsBinaryPath: '',
	alternativeCSSDir: '',
	alternativeJSDir: '',
	alternativeFavicon: '',
}

export default class KremsObsidianPlugin extends Plugin {
	settings: KremsObsidianPluginSettings;
	isKremsLocallyRunning: boolean = false;
	localKremsProcess: ChildProcess | null = null;


	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('cloud-lightning', 'Krems Publisher', (evt: MouseEvent) => {
			new ActionModal(this.app, this).open();
		});

		this.addSettingTab(new KremsSettingTab(this.app, this));
		console.log('Krems Obsidian Plugin loaded.');
	}

	onunload() {
		// Ensure any running Krems process is killed when the plugin unloads
		if (this.localKremsProcess) {
			console.log('Krems Obsidian Plugin unloading: Killing active Krems process.');
			this.localKremsProcess.kill();
			this.localKremsProcess = null;
			this.isKremsLocallyRunning = false;
		}
		console.log('Krems Obsidian Plugin unloaded.');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_KREMS_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Helper to execute shell commands
	async execShellCommand(command: string, cwd: string, customEnv?: NodeJS.ProcessEnv, commandForDisplay?: string): Promise<{ stdout: string; stderr: string }> {
		return new Promise((resolve, reject) => {
			const env = customEnv ? { ...process.env, ...customEnv } : process.env;
			const displayCmd = commandForDisplay || command;
			
			exec(command, { cwd, env }, (error, stdout, stderr) => {
				const result = { stdout: stdout.trim(), stderr: stderr.trim() };
				if (error) {
					console.error(`Command failed: ${displayCmd}\nError: ${error.message}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`);
					reject({
						message: `Command failed: ${displayCmd}. Error: ${error.message}`, 
						stdout: result.stdout,
						stderr: result.stderr,
						originalError: error
					});
					return;
				}
				if (result.stderr) {
					console.warn(`Command successful but stderr present: ${displayCmd}\nStderr: ${result.stderr}`);
				}
				resolve(result);
			});
		});
	}

	getKremsBinaryDir(): string {
		// @ts-ignore App.vault.configDir is available in desktop
		return path.join(this.app.vault.configDir, "plugins", this.manifest.id, "bin");
	}

	getKremsBinaryName(): string {
		switch (process.platform) {
			case 'win32': return 'krems-windows-amd64.exe';
			case 'darwin': return 'krems-darwin-amd64'; // Assuming amd64 for now
			case 'linux': return 'krems-linux-amd64';
			default: return ''; // Unsupported
		}
	}

	async ensureKremsBinary(feedbackUpdater: (message: string, type: 'status' | 'success' | 'error') => void): Promise<string | null> {
		const binaryName = this.getKremsBinaryName();
		if (!binaryName) {
			feedbackUpdater('Unsupported operating system for Krems download.', 'error');
			return null;
		}

		const binaryDir = this.getKremsBinaryDir();
		const binaryPath = path.join(binaryDir, binaryName); // This is vault-relative

		// @ts-ignore
		const vaultBasePath = this.app.vault.adapter.getBasePath(); // Get vault's absolute base path
		const absoluteBinaryPath = path.join(vaultBasePath, binaryPath); // Create absolute OS path for fs operations

		this.settings.localKremsBinaryPath = binaryPath; // Store the vault-relative path for settings
		await this.saveSettings();


		// @ts-ignore
		const adapter = this.app.vault.adapter;

		try {
			if (await adapter.exists(binaryPath)) { // adapter.exists uses vault-relative path
				feedbackUpdater('Krems binary already downloaded.', 'status');
				// Ensure it's executable (especially on mac/linux after unzipping/copying)
				if (process.platform !== 'win32') {
					try {
						fs.chmodSync(absoluteBinaryPath, 0o755); // Use absolute path for chmod
					} catch (chmodErr) {
						console.error("Failed to chmod existing binary:", chmodErr);
						feedbackUpdater('Found Krems binary, but failed to set executable permission. Please check manually.', 'error');
						return null;
					}
				}
				return binaryPath;
			}
		} catch (e) {
			console.error("Error checking for existing Krems binary:", e);
			feedbackUpdater('Error checking for existing Krems binary. Attempting download.', 'error');
		}
		
		feedbackUpdater(`Downloading Krems for ${process.platform}...`, 'status');
		
		try {
			if (!(await adapter.exists(binaryDir))) {
				await adapter.mkdir(binaryDir);
			}

			const downloadUrl = `https://github.com/mreider/krems/releases/latest/download/${binaryName}`;
			const response = await requestUrl({ url: downloadUrl, method: 'GET' });

			if (response.status !== 200) {
				throw new Error(`Failed to download Krems: Server responded with ${response.status}`);
			}
			
			await adapter.writeBinary(binaryPath, response.arrayBuffer);
			feedbackUpdater('Krems downloaded successfully.', 'status');

			if (process.platform !== 'win32') {
				feedbackUpdater('Setting executable permissions...', 'status');
				fs.chmodSync(absoluteBinaryPath, 0o755); // Use absolute path for chmod
				feedbackUpdater('Permissions set.', 'status');
			}
			return binaryPath; // Return vault-relative path

		} catch (error: any) {
			console.error('Krems download error:', error);
			feedbackUpdater(`Failed to download Krems: ${error.message || error.toString()}`, 'error');
			return null;
		}
	}
}

class ActionModal extends Modal {
	plugin: KremsObsidianPlugin;
	initButton: HTMLButtonElement;
	browseLocallyButton: HTMLButtonElement;
	stopKremsButton: HTMLButtonElement;
	initFeedbackEl: HTMLDivElement;


	constructor(app: App, plugin: KremsObsidianPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Krems Publisher Actions' });

		// --- Clone Your Repo ---
		const initSection = contentEl.createDiv({ cls: 'krems-modal-section' });
		initSection.createEl('h4', { text: '1. Clone Your Repo' });
		const initDesc = initSection.createEl('p', { text: `This will clone your repo from GitHub into your specified local directory (${this.plugin.settings.localMarkdownPath || 'not set'}).`});
		this.initButton = initSection.createEl('button', { text: 'Clone Your Repo' });
		this.initFeedbackEl = initSection.createEl('div', { cls: 'krems-feedback', attr: { style: 'margin-top: 10px;' } }) as HTMLDivElement;
		const initWarningEl = initSection.createEl('p', {cls: 'krems-warning', attr: { style: 'display: none;' }});


		const setInitFeedback = (message: string, type: 'status' | 'success' | 'error') => {
			this.initFeedbackEl.textContent = message;
			this.initFeedbackEl.className = `krems-feedback krems-feedback-${type}`;
		};

		// Initial check for initButton state
		const localMarkdownPathForInit = this.plugin.settings.localMarkdownPath;
		const githubRepoUrlSet = !!this.plugin.settings.githubRepoUrl;

		if (!localMarkdownPathForInit || !githubRepoUrlSet) {
			this.initButton.disabled = true;
			initWarningEl.textContent = 'Please set Local Markdown Directory and GitHub Repo URL in settings.';
			initWarningEl.style.display = 'block';
		}

		this.initButton.addEventListener('click', async () => {
			const { localMarkdownPath, githubRepoUrl } = this.plugin.settings;
		
			if (!localMarkdownPath || !githubRepoUrl) {
				setInitFeedback('Error: Local Markdown Directory and GitHub Repo URL must be set in plugin settings.', 'error');
				return;
			}
		
			// @ts-ignore
			const vaultBasePath = this.app.vault.adapter.getBasePath();
			const absoluteLocalPath = path.join(vaultBasePath, localMarkdownPath);
		
			this.initButton.disabled = true;
			setInitFeedback(`Cloning your repository from ${githubRepoUrl}...`, 'status');
		
			try {
				const cloneCommand = `git clone ${githubRepoUrl} "${absoluteLocalPath}"`;
				await this.plugin.execShellCommand(cloneCommand, vaultBasePath, undefined, 'git clone <your-repo-url> <path>');
				setInitFeedback('Repository cloned successfully!', 'success');
			} catch (error: any) {
				console.error('Cloning error:', error.message || error);
				let errorMsg = error.stderr || error.message || error.toString();
				if (errorMsg.includes('already exists and is not an empty directory')) {
					errorMsg = `Directory already exists and is not empty. If you have existing changes, please commit and push them. If you want to start fresh, please delete the directory and try again. If there are git conflicts, please resolve them manually.`;
				}
				setInitFeedback(`Cloning failed: ${errorMsg}`, 'error');
			} finally {
				this.initButton.disabled = false;
			}
		});

		// --- Browse Locally Section ---
		const browseSection = contentEl.createDiv({ cls: 'krems-modal-section' });
		browseSection.createEl('h4', { text: '2. Preview Site Locally' });
		this.browseLocallyButton = browseSection.createEl('button', { text: 'Browse Locally' });
		this.stopKremsButton = browseSection.createEl('button', { text: 'Stop Local Server' });
		const browseFeedbackEl = browseSection.createEl('div', { cls: 'krems-feedback', attr: { style: 'margin-top: 10px; white-space: pre-wrap; background-color: var(--background-secondary); padding: 5px; border-radius: 3px; max-height: 150px; overflow-y: auto;' } });
		const browseWarningEl = browseSection.createEl('p', {cls: 'krems-warning', attr: { style: 'display: none;' }});


		const setBrowseFeedback = (message: string, type: 'status' | 'success' | 'error' | 'log') => {
			if (type === 'log') {
				browseFeedbackEl.textContent += message + '\n';
				browseFeedbackEl.scrollTop = browseFeedbackEl.scrollHeight;
			} else {
				browseFeedbackEl.textContent = message;
			}
			browseFeedbackEl.className = `krems-feedback krems-feedback-${type}`;
		};

		const updateBrowseButtonsState = () => {
			if (this.plugin.isKremsLocallyRunning) {
				this.browseLocallyButton.setText('Server Running');
				this.browseLocallyButton.disabled = true;
				this.stopKremsButton.disabled = false;
			} else {
				this.browseLocallyButton.setText('Browse Locally');
				this.browseLocallyButton.disabled = false;
				this.stopKremsButton.disabled = true;
			}
			const { localMarkdownPath } = this.plugin.settings;
			if (!localMarkdownPath) {
				this.browseLocallyButton.disabled = true;
				this.stopKremsButton.disabled = true;
				browseWarningEl.textContent = 'Please set Local Markdown Directory in settings.';
				browseWarningEl.style.display = 'block';
			} else {
				browseWarningEl.style.display = 'none';
			}
		};
		updateBrowseButtonsState();


		this.browseLocallyButton.addEventListener('click', async () => {
			const { localMarkdownPath, localRunPort } = this.plugin.settings;
			if (!localMarkdownPath) {
				setBrowseFeedback('Error: Local Markdown Directory must be set.', 'error');
				return;
			}

			this.browseLocallyButton.disabled = true;
			setBrowseFeedback('Preparing local preview...', 'status');

			const userConfirmed = confirm("To preview your site locally, this will download the Krems binary (if not already present) and set executable permissions. This step is for local preview and not strictly necessary for publishing to GitHub. Is it okay to proceed?");

			if (!userConfirmed) {
				setBrowseFeedback('Local preview cancelled by user.', 'status');
				updateBrowseButtonsState();
				return;
			}

			const kremsBinaryVaultRelativePath = await this.plugin.ensureKremsBinary(setBrowseFeedback);
			if (!kremsBinaryVaultRelativePath) {
				updateBrowseButtonsState(); // Re-enable button if download/chmod failed
				return;
			}
			
			// @ts-ignore
			const vaultBasePath = this.app.vault.adapter.getBasePath();
			const absoluteKremsBinaryPath = path.join(vaultBasePath, kremsBinaryVaultRelativePath); // Use absolute path for spawning
			const absoluteLocalPath = path.join(vaultBasePath, localMarkdownPath);
			const portToUse = localRunPort || DEFAULT_KREMS_SETTINGS.localRunPort || "8080";

			setBrowseFeedback(`Starting Krems server on port ${portToUse}...`, 'status');

			try {
				this.plugin.localKremsProcess = spawn(
					absoluteKremsBinaryPath, // Use absolute path
					['--run', '--port', portToUse], 
					{ cwd: absoluteLocalPath, shell: process.platform === 'win32' } // shell: true for windows often helps with .exe
				);
				this.plugin.isKremsLocallyRunning = true;
				updateBrowseButtonsState();
				setBrowseFeedback(`Krems server starting on port ${portToUse}. Output:\n`, 'log');
				
				// Try to open browser after a short delay
				setTimeout(() => {
					window.open(`http://localhost:${portToUse}`, '_blank');
				}, 1500);


				this.plugin.localKremsProcess.stdout?.on('data', (data) => {
					setBrowseFeedback(data.toString(), 'log');
				});
				this.plugin.localKremsProcess.stderr?.on('data', (data) => {
					setBrowseFeedback(`[STDERR] ${data.toString()}`, 'log');
				});
				this.plugin.localKremsProcess.on('error', (err) => {
					console.error('Failed to start Krems process:', err);
					setBrowseFeedback(`Failed to start Krems: ${err.message}`, 'error');
					this.plugin.isKremsLocallyRunning = false;
					this.plugin.localKremsProcess = null;
					updateBrowseButtonsState();
				});
				this.plugin.localKremsProcess.on('close', (code) => {
					setBrowseFeedback(`Krems server exited with code ${code}.`, code === 0 ? 'status' : 'error');
					this.plugin.isKremsLocallyRunning = false;
					this.plugin.localKremsProcess = null;
					updateBrowseButtonsState();
				});

			} catch (error: any) {
				console.error('Error spawning Krems:', error);
				setBrowseFeedback(`Error starting Krems: ${error.message || error.toString()}`, 'error');
				this.plugin.isKremsLocallyRunning = false;
				this.plugin.localKremsProcess = null;
				updateBrowseButtonsState();
			}
		});

		this.stopKremsButton.addEventListener('click', async () => {
			if (this.plugin.localKremsProcess) {
				setBrowseFeedback('Stopping Krems server...', 'status');
				this.plugin.localKremsProcess.kill(); 
				// The 'close' event handler will update state and buttons.
			} else {
				setBrowseFeedback('Krems server is not running.', 'status');
				this.plugin.isKremsLocallyRunning = false; // Ensure consistency
				updateBrowseButtonsState();
			}
			// Run --clean after stopping, if binary path is known
			const kremsBinaryVaultRelativePath = this.plugin.settings.localKremsBinaryPath;
			const { localMarkdownPath } = this.plugin.settings;
			if (kremsBinaryVaultRelativePath && localMarkdownPath) {
				// @ts-ignore
				const vaultBasePath = this.app.vault.adapter.getBasePath();
				const absoluteLocalPath = path.join(vaultBasePath, localMarkdownPath);
				const absoluteKremsBinaryPathForClean = path.join(vaultBasePath, kremsBinaryVaultRelativePath);

				setBrowseFeedback('Cleaning up .tmp directory...', 'status');
				try {
					await this.plugin.execShellCommand(`"${absoluteKremsBinaryPathForClean}" --clean`, absoluteLocalPath, undefined, 'krems --clean');
					setBrowseFeedback('Cleanup successful.', 'status');
				} catch (cleanError: any) {
					console.error("Krems clean error:", cleanError);
					setBrowseFeedback(`Cleanup failed: ${cleanError.stderr || cleanError.message}`, 'error');
				}
			}
		});


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
				if (cmdOutput.stderr) { setPushFeedback(`Git add (warnings): ${cmdOutput.stderr}`, 'status');}


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
					if (cmdOutput.stderr) { 
						setPushFeedback(`Git commit (warnings): ${cmdOutput.stderr}`, 'status');
					}
				} catch (commitError: any) {
					if (commitError.stdout && commitError.stdout.includes("nothing to commit")) {
						setPushFeedback('No changes to commit. Proceeding to push...', 'status');
					} else {
						throw commitError; 
					}
				}
				
				setPushFeedback('Pushing to remote repository...', 'status');
				let pushCommand = 'git push';
				let displayPushCommand = 'git push';
				
				if (gitPassword && githubRepoUrl.startsWith('https://')) {
					const urlWithoutProtocol = githubRepoUrl.substring('https://'.length);
					const authenticatedUrl = `https://${gitPassword}@${urlWithoutProtocol}`;
					
					let currentBranch = 'main';
					try {
						cmdOutput = await this.plugin.execShellCommand('git rev-parse --abbrev-ref HEAD', absoluteLocalPath);
						currentBranch = cmdOutput.stdout;
						if (cmdOutput.stderr) { setPushFeedback(`Git branch check (warnings): ${cmdOutput.stderr}`, 'status');}
					} catch (branchError: any) {
						console.warn("Could not determine current branch, defaulting to 'main'. Error:", branchError.message);
						setPushFeedback(`Warning: Could not determine current branch (using 'main'). Details: ${branchError.stderr || branchError.message}`, 'status');
					}
					pushCommand = `git push ${authenticatedUrl} ${currentBranch}`;
					displayPushCommand = `git push <authenticated_url> ${currentBranch}`; 
					setPushFeedback(`Pushing to ${githubRepoUrl} (authenticated)...`, 'status');
				} else {
					setPushFeedback(`Pushing to ${githubRepoUrl} (unauthenticated, ensure credential helper or SSH is set up)...`, 'status');
				}
				
				cmdOutput = await this.plugin.execShellCommand(pushCommand, absoluteLocalPath, undefined, displayPushCommand);
				if (cmdOutput.stderr) { 
					setPushFeedback(`Push successful with warnings: ${cmdOutput.stderr}`, 'success');
				} else {
					setPushFeedback('Site pushed successfully!', 'success');
				}

			} catch (error: any) {
				console.error('Push error:', error.message || error); 
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
			.setDesc('Git URL of your Krems repository (e.g., git@github.com:username/repo.git).')
			.addText(text => {
				const feedbackEl = text.inputEl.parentElement?.createEl('div', { cls: 'krems-setting-feedback', attr: { style: 'display: none; margin-top: 5px;' }}) as HTMLElement;
				text.setPlaceholder('git@github.com:username/repo.git')
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
					// Validation for git@github.com:user/repo.git format, allowing for dots in repo name
					const gitUrlRegex = /^git@github\.com:[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+(\.git)?$/;
					if (!gitUrlRegex.test(value)) {
						isValid = false; message = 'Invalid format. Use git@github.com:user/repo.git';
					} else {
						message = 'URL format is valid.';
					}
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
			.setDesc('Required for pushing to HTTPS repositories. Create a PAT on GitHub with "repo" and "workflow" scopes. See plugin README for instructions.')
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
		
		new Setting(containerEl)
			.setName('Port for Local Server (Optional)')
			.setDesc('Port for "Browse Locally" feature. Defaults to 8080 if blank or invalid.')
			.addText(text => {
				const feedbackEl = text.inputEl.parentElement?.createEl('div', { cls: 'krems-setting-feedback', attr: { style: 'display: none; margin-top: 5px;' }}) as HTMLElement;
				text.setPlaceholder('e.g., 8080')
					.setValue(this.plugin.settings.localRunPort || '')
					.onChange(async (value) => {
						this.plugin.settings.localRunPort = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.addEventListener('focusout', () => {
					const portVal = this.plugin.settings.localRunPort;
					if (!portVal) { // Empty is OK, will use default
						setFeedback(text.inputEl, feedbackEl, 'Using default port 8080.', true); return;
					}
					const portNum = parseInt(portVal, 10);
					if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
						setFeedback(text.inputEl, feedbackEl, 'Invalid port. Must be a number between 1024-65535.', false);
					} else {
						setFeedback(text.inputEl, feedbackEl, 'Port is valid.', true);
					}
				});
				if (this.plugin.settings.localRunPort) text.inputEl.dispatchEvent(new Event('focusout'));
			});

		containerEl.createEl('h3', { text: 'Alternative Asset Paths (Optional)' });
		containerEl.createEl('p', { text: 'Specify paths relative to your "Local Markdown Directory" for custom CSS, JS, or favicon. If left blank, Krems defaults will be used.' });

		new Setting(containerEl)
			.setName('Alternative CSS Directory')
			.setDesc('Path to a directory containing your custom .css files (e.g., "my-styles/css").')
			.addText(text => text
				.setPlaceholder('e.g., assets/css')
				.setValue(this.plugin.settings.alternativeCSSDir || '')
				.onChange(async (value) => {
					this.plugin.settings.alternativeCSSDir = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Alternative JS Directory')
			.setDesc('Path to a directory containing your custom .js files (e.g., "my-scripts/js").')
			.addText(text => text
				.setPlaceholder('e.g., assets/js')
				.setValue(this.plugin.settings.alternativeJSDir || '')
				.onChange(async (value) => {
					this.plugin.settings.alternativeJSDir = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Alternative Favicon File')
			.setDesc('Path to your custom favicon file (e.g., "my-images/favicon.png").')
			.addText(text => text
				.setPlaceholder('e.g., assets/images/custom-favicon.ico')
				.setValue(this.plugin.settings.alternativeFavicon || '')
				.onChange(async (value) => {
					this.plugin.settings.alternativeFavicon = value.trim();
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
