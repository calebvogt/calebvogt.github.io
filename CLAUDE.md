# calebvogt.github.io-website-source: notes for Claude

The source of Caleb's website, https://calebvogt.github.io (Jekyll). README.md describes the layout.

## Publishing: always remind Caleb of the command

This repo is **private**. The live site is served from a separate **public** repo, `calebvogt/calebvogt.github.io`,
which holds only the built HTML. Since 2026-11-06, Caleb's GitHub education plan ended, and Pages on the free plan
only serves public repos. **Pushing this repo does not update the live site.**

Whenever Caleb wants to update, publish, push or deploy the website, or has just finished a change to it, remind him
of the steps and give him the command in its own `bash` block:

1. Commit the changes and push them (GitHub Desktop: Commit, then Push origin).
2. Publish:

```bash
~/Documents/GitHub/calebvogt.github.io-website-source/tools/deploy_site.sh
```

The site updates about a minute later. The script builds the committed HEAD only: it warns about uncommitted or
unpushed work. Offer to run it for him when the change was made in this session.

Preview locally before publishing (http://localhost:4000; Ctrl-C stops it):

```bash
cd ~/Documents/GitHub/calebvogt.github.io-website-source && bundle exec jekyll serve --config _config.yml,_config_dev.yml
```

## Rules

- Never push this source to the public repo, and never edit the public repo by hand: each deploy replaces its files.
- `PhotoGallery/`, `Home/` and `ProjectFiles/` hold originals that exist only on Caleb's computers (git-ignored). Never
  delete them; only the resized web copies in `assets/` are committed.
- The FNT documentation at /fnt comes from the fnt repo's gh-pages branch, not from here.
