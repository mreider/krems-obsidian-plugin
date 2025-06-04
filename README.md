# Krems Obsidian Plugin

This plugin lets you publish Markdown websites to Github pages. It uses [Krems](https://github.com/mreider/krems) under the hood.

- Currently in Beta
- Use [BRAT](https://github.com/TfTHacker/obsidian42-brat) to try it

[☕️ Buy me a coffee ☕️](https://coff.ee/mreider)

## Getting started

1. Create a Classic Personal Access Token (PAT) in Github with Repo and Workflow privileges
2. Create an empty Github repository (ex: "my-blog")
3. Create an empty folder in your vault (ex: "my-blog")
3. Install the Krems plugin via BRAT
5. Configure the plugin with:
    - URL of your Github repository (ex: https://github.com/you/my-blog)
    - The Github PAT
    - The name of the empty vault folder (ex: "my-blog")
6. Enable the plugin

## Initialize local folder

After enabling you should see a Krems button on your ribbon (cloud with lightening bolt).

1. Choose the Krems button
2. Choose Initialize
3. This will:
    - Download a small example into the folder you configured
    - You can see the final result [here](https://mreider.github.io/krems-example/)
    - Configure the example to target your empty Github repo
4. (optional) Choose Browse Locally to see the example
5. This will:
    - Download the Krems binary (you can cancel if that sounds scary)
    - Runs the binary to serve the example on localhost:8080
    - Launches a browser to browse the example locally
6. Choose Stop Local Server to shut it down
7. Choose Push to Github
8. This will:
    - Push the example to your Github repo
    - Run a Github Workflow to create a gh-pages branch
    - Generate the website on that gh-pages branch
9. Turn on Github Pages in your repository
    - Push from the gh-pages branch
    - Use the /(root) folder
10. View your repository's actions
    - An action should be running
    - When it's done your website will be ready

You can view your website in a browser.

For example:

https://your-gh-user.github.io/my-blog/

Note: The config.yaml file contains my example URL, so links will redirect to that URL instead of yours. To fix this, edit your local config.yaml file and redeploy.


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
