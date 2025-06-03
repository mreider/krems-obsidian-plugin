# Krems Obsidian Publisher Plugin

This plugin allows you to manage and publish your [Krems](https://github.com/mreider/krems) static site directly from Obsidian.

## How It Works

1.  **Configure:** In the plugin settings, specify:
    *   Your GitHub repository URL (e.g., `https://github.com/username/your-repo`). **Must be HTTPS.**
    *   The path within your Obsidian vault where your Krems site's markdown files are located.
    *   A **GitHub Personal Access Token (PAT)**. This is required for pushing changes to your repository via HTTPS. See "Creating a Personal Access Token" below.
2.  **Actions (via Ribbon Icon):**
    *   **Initialize Local Directory:** Clones a Krems example site (`https://github.com/mreider/krems-example`) into your specified local directory and updates the Git remote to point to your repository.
    *   **Start/Stop Krems Locally:** Runs `krems --run` to build and serve your site locally for preview at `http://localhost:8080`.
    *   **Push Site to GitHub:** Commits and pushes the contents of your local Krems markdown directory to your configured GitHub repository. This typically triggers a GitHub Action (like `krems-deploy-action`) in your repository to build and deploy the site to GitHub Pages.

## Prerequisites & Setup

### 1. GitHub Repository

*   **Create a new GitHub repository** for your Krems site if you don't have one.
*   **Important:** The plugin pushes your markdown source files to this repository. You'll need a separate mechanism (like the `mreider/krems-deploy-action` GitHub Action) in that repository to build the HTML from these markdown files and deploy it to GitHub Pages.

### 2. GitHub Pages Setup (Chicken & Egg)

*   GitHub Pages typically deploys from a specific branch (e.g., `gh-pages`) and a specific folder (often root or `/docs`).
*   **Initial Push:** You might need to push content to your repository *once* (e.g., an empty commit or the initial markdown files via this plugin) to create the main branch (e.g., `main` or `master`).
*   **Set Up GitHub Pages:**
    1.  Go to your repository on GitHub -> Settings -> Pages.
    2.  Under "Build and deployment", select "Deploy from a branch" as your source.
    3.  Choose the branch your deployment action (e.g., `krems-deploy-action`) will push the built HTML site to (commonly `gh-pages`).
    4.  Select the folder within that branch (usually `/ (root)`).
    5.  Save changes.

### 3. (Recommended) `krems-deploy-action`

*   For automated building and deployment to GitHub Pages, it's highly recommended to set up the `mreider/krems-deploy-action` (or a similar GitHub Action) in your site's GitHub repository. This action will listen for pushes to your main branch, run Krems to build the HTML, and then push the HTML to your `gh-pages` branch (or as configured).

### 4. Creating a Personal Access Token (PAT) for GitHub

Since GitHub no longer supports password authentication for Git operations over HTTPS, you **must** use a Personal Access Token (PAT) if your repository URL is HTTPS.

1.  Go to your GitHub settings:
    *   Click your profile picture (top-right) -> Settings.
    *   In the left sidebar, scroll down to Developer settings.
    *   Click Personal access tokens -> Tokens (classic).
2.  Click "Generate new token" (or "Generate new token (classic)").
3.  Give your token a descriptive name (e.g., "Obsidian Krems Plugin").
4.  Set an expiration date for the token.
5.  Under "Select scopes", check the **`repo`** scope. This will grant full control of private and public repositories, which is needed for cloning and pushing.
6.  Click "Generate token".
7.  **Important:** Copy your new PAT immediately. You won't be able to see it again.
8.  Paste this PAT into the "GitHub Personal Access Token (PAT)" field in this plugin's settings.

## Using the Plugin

1.  Install the plugin in Obsidian.
2.  Configure the settings.
3.  Click the "Krems Publisher" (cloud-lightning icon) in the left ribbon to access actions.

---

*This plugin primarily manages your local Krems markdown source and pushes it to GitHub. The actual live site deployment is typically handled by a GitHub Action in your target repository.*
