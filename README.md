# Krems Obsidian Plugin

This plugin lets you publish Markdown websites to Github pages. It uses [Krems](https://github.com/mreider/krems) under the hood.

- Currently in Beta
- Use [BRAT](https://github.com/TfTHacker/obsidian42-brat) to try it

[☕️ Buy me a coffee ☕️](https://coff.ee/mreider)

## Getting started

1. **Fork the Example Repository**: To get started quickly, fork the [krems-example](https://github.com/mreider/krems-example) repository to your own GitHub account. This will give you a copy of a working Krems site, including the necessary GitHub Actions workflow for publishing.

2. **Install the Plugin**: Use [BRAT](https://github.com/TfTHacker/obsidian42-brat) to install the Krems Publisher plugin in Obsidian.

3. **Create a Local Folder**: Create an empty folder inside your Obsidian vault where you want to clone your forked repository (e.g., "my-blog").

4. **Configure the Plugin**:
    - Go to the Krems Publisher plugin settings.
    - **GitHub Repository URL**: Enter the `git@` URL of your Krems repository. You can find this on your repository's page under `Code > Clone > SSH`. It should look like `git@github.com:your-username/krems-example.git`.
    - **Local Markdown Directory**: Enter the name of the empty folder you created in your vault (e.g., "my-blog").
    - **(Optional) Git Author Name/Email**: Set your name and email for Git commits.

5. **Enable the Plugin**: Make sure the plugin is enabled in Obsidian.

## Clone Your Repository

After configuring the plugin, you'll find a Krems button on your ribbon (a cloud with a lightning bolt).

1.  **Open the Action Modal**: Click the Krems ribbon button.
2.  **Clone Your Repo**: Click the "Clone Your Repo" button. This will download the files from your Krems GitHub repository into the local vault folder you specified.
3.  **(Optional) Preview Locally**:
    *   Click "Browse Locally" to preview your site.
    *   The plugin will download the Krems binary (you can cancel if you prefer not to) and start a local server on `localhost:8080`.
    *   Your browser will open to the local preview.
    *   Click "Stop Local Server" when you're done.
4.  **Push to GitHub**:
    *   After making changes to your markdown files, open the action modal again.
    *   Enter a commit message (or use the default).
    *   Click "Push to GitHub". This will send your changes to your remote repository.
5.  **Enable GitHub Pages**:
    *   In your Krems repository on GitHub, go to `Settings > Pages`.
    *   Under "Build and deployment", select `gh-pages` as the branch and `/ (root)` as the folder.
    *   Save the changes.
6.  **Check the Workflow**:
    *   Go to the "Actions" tab in your repository. A workflow should be running to build and deploy your site.
    *   Once the workflow is complete, your website will be live.

You can view your published website at a URL like: `https://your-github-username.github.io/krems-example/`


## Learn from the example and build your own site

The example site shows all of the functionality of Krems. The default CSS works out-of-the-box. If you want to improve it, open a pull request back at the [Krems](https://github.com/mreider/krems) repository and I can update it.

See the config.yaml section (further down the readme) to see how to include your own CSS, JS, and Favicons. CSS must work with standard Bootstrap HTML classes, which you can see [here](https://codepen.io/matthew-reider/pen/dPoOebJ).


## Images

You must store your images in an /images folder and reference them using normal markdown. You can have subfolders of images to keep them organized.

## Page Types

There are two page types.

## List pages

- show links to other pages
- only show pages that have dates
- (usually) have no markdown content
- (usually) show a list of pages in a single directory
- (usually) exist as index.md in a directory
- have the following front matter:

```
---
title: "Krems Home Page"
type: list
created: 2025-06-04T09:24
updated: 2025-06-04T09:39
---
```

## List page filters

List page filters expand the functionality of a list page

- shows all pages in all subdirectories with:
    - specific tags (or...)
    - specific authors
- have the following front matter:


```
---
title: Krems Home Page
type: list
tagFilter:
  - about
authorFilter:
  - Matt
---
```

## Default pages

- have Markdown content
- include an (optional) image
    - is converted to an Open Graph image
    - displayed as a preview images when someone shares the page URL
- have the following frontmatter:

```
---
title: "Krems City Info"
date: "2024-11-26"
image: "/images/krems1.png"
author: "Matt"
tags: ["about"]
---
```

## About config.yaml

- required at root directory
- may not appear as a file in obsidian (browse it manually)
- must have `basePath` if home page is in a subdirectory
- must have `devPath` to run locally without subdirectory
- supports alternative CSS, JS, and favicon paths to override defaults
- follows example below:

```
website:
  url: "https://mreider.github.io/krems-example"
  name: "Krems Example Site"
  basePath: "/krems-example"
  devPath: "/"
  alternativeCSSDir: "path/to/your/css"      # Optional: Directory for your CSS files
  alternativeJSDir: "path/to/your/js"        # Optional: Directory for your JS files
  alternativeFavicon: "path/to/your/favicon.ico" # Optional: Path to your favicon file

menu:
  - title: "Home"
    path: "index.md"
  - title: "Universities"
    path: "universities/index.md"
```

## Questions / feedback

- [about Krems static site generation](https://github.com/mreider/krems/issues)
- [about the Krems Obsidian plugin](https://github.com/mreider/krems-obsidian-plugin/issues)
