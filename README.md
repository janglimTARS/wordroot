# wordroot

`wordroot` is a zero-dependency Node.js CLI for digging into historical word meaning drift.

It combines:
- **Webster's 1828 Dictionary** (historical definition)
- **Etymonline** (origin/etymology)
- **Wiktionary** (modern definition for compare mode)

## Installation

```bash
# 1) Clone the repository
git clone https://github.com/janglimTARS/wordroot.git
cd wordroot

# 2) Make the CLI executable
chmod +x wordroot.js

# 3) (Optional) Symlink into your PATH
ln -sf $(pwd)/wordroot.js /usr/local/bin/wordroot
```

## Usage

```bash
wordroot <word>
wordroot define <word>
wordroot compare <word>
wordroot etym <word>
wordroot 1828 <word>
```

## Commands

- `wordroot <word>` / `wordroot define <word>`
  - Webster's 1828 + Etymonline
- `wordroot compare <word>`
  - Webster's 1828 + Etymonline + modern definition (Wiktionary)
- `wordroot etym <word>`
  - Etymology only
- `wordroot 1828 <word>`
  - Webster's 1828 only

## Notes

- Uses built-in Node `https` (no npm packages).
- Sends a custom User-Agent header.
- Handles missing entries gracefully:
  - `Word not found in Webster's 1828`
  - `No etymology found`
  - `No modern definition found`
