const fs = require('fs');
const path = require('path');

const sourceDir = process.cwd();
const destDir = `D:/all/work/Obsidian Dev Vault/.obsidian/plugins/obsidian-export-image`;

const files = ['main.js', 'manifest.json', 'styles.css'];

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  console.error(`Destination directory does not exist: ${destDir}`);
  process.exit(1);
}

// Copy each file
files.forEach(file => {
  const sourcePath = path.join(sourceDir, file);
  const destPath = path.join(destDir, file);

  if (!fs.existsSync(sourcePath)) {
    console.error(`Source file not found: ${sourcePath}`);
    process.exit(1);
  }

  try {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`✓ Copied ${file} to ${destDir}`);
  } catch (error) {
    console.error(`✗ Failed to copy ${file}: ${error.message}`);
    process.exit(1);
  }
});

console.log('\n✓ Deploy completed successfully!');

