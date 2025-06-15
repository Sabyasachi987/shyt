#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const zlib =require("node:zlib")
const crypto=require('crypto')
const chalk = require('chalk');
const diff = require("diff")
//                                                       ISMEH LAST KAM KIYA THA


let ignored = [];

const ignoreFile = path.join(process.cwd(), ".sHytignore");
if (fs.existsSync(ignoreFile)) {
  ignored = fs.readFileSync(ignoreFile, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));
}



// Uncomment this block to pass the first stage
const command = process.argv[2];
//
switch (command) {
  case "init":     //ACTUAL
    createGitDirectory();
    break;
  case "cat-file":    //READS THE FILE-UNZIPS IT -REMOVES HEADER-PRINT THE HEADER
    readFileBlob();
    break;
  case "hash-object":    //TAKES THE FILE-WRAPS IT -ZIPS IT -SAVES TO .GIT/OBJECTS
    hashObject(process.argv);
    break;
  case "write-tree":
    writeTree();
    break;
  case "checktree":
    checktree();
    break;
  case "commit-tree":
      commitTree(process.argv)
    break; 
  case "log"://ACTUAL
     logHistory()
     break;
  case "add"://ACTUAL
    addPath(process.argv[3]);
    break
  case "commit"://ACTUAL
    commit(process.argv)
    break;
  
  case "status":
  status();
  break;

  case 'branch':
    const branchName = process.argv[3];
    if (!branchName) {
      listBranches(); // no arg = list all branches
    } else {
      createBranch(branchName); // arg = create new branch
    }
    break;

  case "checkout":
   case "switch":
  const branchToSwitch = process.argv[3];
  if (!branchToSwitch) {
    console.error(chalk.red("❌ Please provide a branch name to switch."));
    return;
  }
  checkoutBranch(branchToSwitch);
  break;


 case "merge":
    if (process.argv[3]=== "--continue") {
      mergeContinue();
    } else if (!process.argv[3]) {
      console.error(chalk.red("❌ Please specify a branch to merge."));
    } else {
      mergeBranch(process.argv[3]);
    }
    break;

   case "current-branch":
  const branch = currentBranch();
  if (branch) console.log(chalk.green(`🔀 Current branch: ${branch}`));
  break;
 
   case "unstage":
  const fileToUnstage = process.argv[3];
  if (!fileToUnstage) {
    console.error(chalk.red("❌ Please provide a file to unstage, or '.' to unstage all."));
  } else {
    unstage(fileToUnstage);
  }
  break;
  
  case "diff":
  const [branchA, branchB] = [process.argv[3], process.argv[4]];
  if (!branchA || !branchB) {
    console.error(chalk.red("❌ USAGE: shyt diff <branchA> <branchB>"));
  } else {
    diffBranches(branchA, branchB);
  }
  break;


  default:
  console.error(chalk.red.bold(`❌ UNKNOWN COMMAND: '${command.toUpperCase()}'`));
  console.error(chalk.yellow("👉 Available commands: init, add, commit, log, status, branch, checkout, merge, diff"));
  process.exit(1);

}

function createGitDirectory() {
  fs.mkdirSync(path.join(process.cwd(), ".sHyt"), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), ".sHyt", "objects"), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), ".sHyt", "refs"), { recursive: true });

  fs.writeFileSync(path.join(process.cwd(), ".sHyt", "HEAD"), "ref: refs/heads/main\n");

  // ✅ Create empty .sHytignore if not exists
  const ignorePath = path.join(process.cwd(), ".sHytignore");
  if (!fs.existsSync(ignorePath)) {
    fs.writeFileSync(ignorePath, "# Add files/folders to ignore\n");
  }

  console.log(chalk.blue("Initialized git directory"));
}



function readFileBlob() {
  const sha = process.argv[4];
  const folder = sha.substring(0, 2);
  const file = sha.substring(2);
  const objectPath = path.join(process.cwd(), ".sHyt", "objects", folder, file);
  const compressed = fs.readFileSync(objectPath);
  const decompressed = zlib.unzipSync(compressed);

  const headerEnd = decompressed.indexOf(0); // null byte separates header
  const header = decompressed.subarray(0, headerEnd).toString(); // e.g. "blob 14"
  const content = decompressed.subarray(headerEnd + 1); // actual object content
  

  const [type] = header.split(" "); // type is 'blob', 'tree', or 'commit'

  if (type === "blob" || type === "commit") {
    process.stdout.write(content.toString()); // just print as-is
  } else if (type === "tree") {
    // Tree format: multiple entries of [mode] space [filename] null [sha]
    let i = 0;
    while (i < content.length) {
      // mode (e.g. 100644), space, filename, null byte, then 20-byte SHA
      const spaceIndex = content.indexOf(0x20, i);
      const mode = content.slice(i, spaceIndex).toString();

      const nullIndex = content.indexOf(0x00, spaceIndex);
      const filename = content.slice(spaceIndex + 1, nullIndex).toString();

      const shaBytes = content.slice(nullIndex + 1, nullIndex + 21); // 20 bytes
      const sha = Buffer.from(shaBytes).toString("hex");

      console.log(chalk.green(`${mode} ${sha} ${filename}`));

      i = nullIndex + 21; // move to next entry
    }
  } else {
    console.error(chalk.red("Unknown object type:", type));
  }
}


async function hashObject(arguments){
    console.log(process.argv[3])
    const fileName=process.argv[3];
      if (!fileName) {
    throw new Error("No file name provided.");
  }
    const fileContent=fs.readFileSync(path.join(__dirname,fileName))
    const objectBuffer=Buffer.from(`blob ${fileContent.length}\x00${fileContent.toString()}`)
    const blobData=zlib.deflateSync(objectBuffer)
    const objectSha=crypto.createHash(`sha1`).update(objectBuffer).digest(`hex`)
    const objectFolder=objectSha[0]+objectSha[1]
    const objectFile=objectSha.slice(2)
    await fs.mkdirSync(path.join(__dirname,'.sHyt','objects',objectFolder),{recursive:true})
    await fs.writeFileSync(path.join(__dirname,'.sHyt','objects',objectFolder,objectFile),blobData)
    process.stdout.write(objectSha)
}




//GIT WRITE-TREE TO HASH THE STRUCTURE OF FILES IN FOLDER AND STORE IT IN .GIT/OBJECTS/<FIRST 2 CHARS OF SHA>/<REST SHA>
function buildTreeFromIndex(index) {
  const tree = {};

  for (const { path: filePath, sha } of index) {
    const parts = filePath.split(path.sep);
    let current = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }

    current[parts[parts.length - 1]] = { sha };
  }

  return tree;
}

function writeTreeRecursive(treeObj) {
  const entries = [];

  for (const name in treeObj) {
    const value = treeObj[name];

    if (value.sha) {
      // It's a file
      const mode = "100644";
      const entryBuffer = Buffer.concat([
        Buffer.from(`${mode} ${name}\x00`),
        Buffer.from(value.sha, "hex")
      ]);
      entries.push(entryBuffer);
    } else {
      // It's a directory (subtree)
      const subtreeSha = writeTreeRecursive(value);
      const mode = "40000"; // mode for tree
      const entryBuffer = Buffer.concat([
        Buffer.from(`${mode} ${name}\x00`),
        Buffer.from(Buffer.from(subtreeSha, "hex"))
      ]);
      entries.push(entryBuffer);
    }
  }

  const treeContent = Buffer.concat(entries);
  const treeHeader = Buffer.from(`tree ${treeContent.length}\x00`);
  const treeBuffer = Buffer.concat([treeHeader, treeContent]);

  const treeSha = crypto.createHash("sha1").update(treeBuffer).digest("hex");
  const folder = treeSha.slice(0, 2);
  const filename = treeSha.slice(2);
  const objectPath = path.join(".sHyt", "objects", folder, filename);

  if (!fs.existsSync(objectPath)) {
    fs.mkdirSync(path.join(".sHyt", "objects", folder), { recursive: true });
    fs.writeFileSync(objectPath, zlib.deflateSync(treeBuffer));
  }

  return treeSha;
}

function writeTree(index) {
  const treeObj = buildTreeFromIndex(index);
  return writeTreeRecursive(treeObj);
}




//JUST TO CHECK THE CONTENT OF THE WRITE-TREE
async function checktree(){
const sha = "c25524edc4f29970686746a2a103e1b6f58dc85c";
const file = sha.slice(2);
const folder = sha.slice(0, 2);

const compressed = fs.readFileSync(path.join('.sHyt', 'objects', folder, file));
const uncompressed = zlib.inflateSync(compressed);
console.log(uncompressed.toString('utf-8'));
}



//THIS CREATE HASH OF THE ENTIRE COMMIT AND  STORE IT IN .GIT/OBJECTS/<2 CHARS OF SHA>/<REST OF SHA> 
//IT ALSO STORE JUST THE LATEST COMMIT HASH IN .GIT/REFS/HEADS/MAIN WHICH IS THE PATH THAT HEAD ALWAYS POINT .GIT/HEAD HEAD HAS THE CONTENT"REF:REFS/HEADS/MAIN"
//SO CONTENT IN .GIT/OBJECTS/FOLDER/FILE AND JUST HASH IN .GIT/REFS/HEADS/MAIM
//SO IT MEANS HEAD ALWAYS POINTS TO THE BRANCH AND BRANCH POINTS TO THE LATEST COMMIT
async function commitTree(treeSha, message, parentShas = []) {
  const timestamp = Math.floor(Date.now() / 1000);
  let commitContent = `tree ${treeSha}\n`;

 
     for (const parent of parentShas) {
    commitContent += `parent ${parent}\n`;
  }
  
 

  commitContent +=
    `author sHyt <you@example.com> ${timestamp} +0000\n` +
    `committer sHyt <you@example.com> ${timestamp} +0000\n\n` +
    `${message}\n`;

  const contentBuffer = Buffer.from(commitContent);
  const header = `commit ${contentBuffer.length}\x00`;
  const fullBuffer = Buffer.concat([Buffer.from(header), contentBuffer]);

  const sha = crypto.createHash("sha1").update(fullBuffer).digest("hex");

  const folder = sha.slice(0, 2);
  const fileName = sha.slice(2);
  const objectPath = path.join(".sHyt", "objects", folder, fileName);

  await fs.mkdirSync(path.join(".sHyt", "objects", folder), { recursive: true });
  await fs.writeFileSync(objectPath, zlib.deflateSync(fullBuffer));

  // Update HEAD ref
  const headFileContent = fs.readFileSync(path.join(".sHyt", "HEAD"), "utf-8").trim();
  const headRefPath = headFileContent.split(" ")[1]; // e.g. refs/heads/main
  const fullBranchPath = path.join(".sHyt", headRefPath);

  await fs.mkdirSync(path.dirname(fullBranchPath), { recursive: true });
  await fs.writeFileSync(fullBranchPath, sha);

  // Auto-tag commit as v1, v2, ...
const tagsDir = path.join(".sHyt", "refs", "tags");
fs.mkdirSync(tagsDir, { recursive: true });

const existingTags = fs.readdirSync(tagsDir)
  .filter(name => /^v\d+$/.test(name))
  .map(tag => parseInt(tag.substring(1))) // Extract number from v1, v2, etc.
  .sort((a, b) => a - b);

const nextVersion = (existingTags.at(-1) || 0) + 1;
const newTagName = `v${nextVersion}`;
const tagPath = path.join(tagsDir, newTagName);

fs.writeFileSync(tagPath, sha);
// message += ` (v${nextVersion})`;
console.log(chalk.bgGray(`📝 Tagged as ${newTagName}`));


  
  return sha;
}




async function logHistory() {
  const headPath = path.join(process.cwd(), ".sHyt", "refs", "heads", "main");

  if (!fs.existsSync(headPath)) {
    console.log(chalk.yellow("No commits yet."));
    return;
  }

  let commitSha = await fs.readFileSync(headPath, "utf-8").trim();

  while (commitSha) {
    const folder = commitSha.slice(0, 2);
    const file = commitSha.slice(2);
    const objectPath = path.join(process.cwd(), ".sHyt", "objects", folder, file);
    const compressed = await fs.readFileSync(objectPath);
    const decompressed = zlib.inflateSync(compressed).toString();

    const lines = decompressed.split("\n");

    const treeLine = lines.find(line => line.startsWith("tree"));
    const parentLine = lines.find(line => line.startsWith("parent"));
    const authorLine = lines.find(line => line.startsWith("author"));
    const messageIndex = lines.findIndex(line => line.trim() === "") + 1;
    const messageLine = lines[messageIndex];

    // Extract timestamp from author line
    let dateString = "";
    if (authorLine) {
      const parts = authorLine.split(" ");
      const timestamp = parseInt(parts[parts.length - 2]); // second last part is the UNIX time
      const date = new Date(timestamp * 1000);
      dateString = date.toString(); // Convert to human-readable format
    }

    console.log(chalk.gray(`commit ${commitSha}`));
    if (parentLine) console.log(chalk.green(`${parentLine}`));
    if (authorLine) console.log(chalk.green(`${authorLine}`));
    if (dateString) console.log(chalk.green(`Date:   ${dateString}`));
    console.log(chalk.green(`\n    ${messageLine}\n`));

    if (parentLine) {
      commitSha = parentLine.split(" ")[1];
    } else {
      break;
    }
  }
}


//THIS HASHES THE FILE CONTENT AND INDEX THEM IN .GIT/INDEX BASED ON WHETHER THEY ARE FOLDER OR FILE
function addPath(inputPath) {
  const fullPath = path.join(process.cwd(), inputPath);

  // ❌ Skip .sHyt directory, and .shytignore file itself
  if (inputPath === ".shytignore" || inputPath.startsWith(".sHyt")) return;

  // ❌ If ignored (based on your .shytignore rules), skip it
  if (ignored.some(pattern => inputPath.startsWith(pattern))) return;

  if (!fs.existsSync(fullPath)) return;

  const stat = fs.statSync(fullPath);

  if (stat.isFile()) {
    addFile(inputPath); // CALLS THE ADDFILEFUNCTION
  } else if (stat.isDirectory()) {
    const files = fs.readdirSync(fullPath);
    for (const file of files) {
      const newPath = path.join(inputPath, file);
      addPath(newPath); // recursive
    }
  }
}


//WHEN WE DO GIT ADD . OR GIT ADD INDEX.TXT
function addFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  let fileContent = fs.readFileSync(fullPath);

  // Detect BOM for UTF-16 LE
  if (fileContent[0] === 0xFF && fileContent[1] === 0xFE) {
    //console.warn(`${filePath} is UTF-16 LE encoded. Converting to UTF-8...`);
    fileContent = Buffer.from(fileContent.toString("utf16le").replace(/^\uFEFF/, ""), "utf8");
  }

  const header = `blob ${fileContent.length}\x00`;
  const objectBuffer = Buffer.concat([Buffer.from(header), fileContent]);
  const objectSha = crypto.createHash("sha1").update(objectBuffer).digest("hex");
  const compressed = zlib.deflateSync(objectBuffer);

  const folder = objectSha.slice(0, 2);
  const file = objectSha.slice(2);
  const dir = path.join(".sHyt", "objects", folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), compressed);


  // 5. Stage the file in .sHyt/index
  const indexPath = path.join(process.cwd(), ".sHyt", "index");
  let index = [];

  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  }

const existingIndex = index.findIndex(entry => entry.path === filePath);
if (existingIndex === -1) {
  // New entry
  index.push({ path: filePath, sha: objectSha });
} else {
  // Update existing entry
  index[existingIndex].sha = objectSha;
}
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  console.log(chalk.green.italic(`Added ${filePath}`));
}

//helper for commit when in
function hasConflictMarkers(filePath) {
  if (!fs.existsSync(filePath)) return false;

  try {
    const content = fs.readFileSync(filePath, "utf-8");

    return (
      content.includes("<<<<<<<") &&
      content.includes("=======") &&
      content.includes(">>>>>>>")
    );
  } catch (err) {
    // Non-text or unreadable file
    return false;
  }
}


//WHEN WE DO GIT COMMIT -M "MESSAGE"
async function commit(args) {
  const messageIndex = args.indexOf("-m");
  if (messageIndex === -1 || !args[messageIndex + 1]) {
    console.error(chalk.red("❌ Missing commit message."));
    return;
  }

  const message = args[messageIndex + 1];

  // 🔒 BLOCK COMMIT if there's any conflict marker in working directory
  const allFiles = getAllFiles(".");
  const conflictFiles = allFiles.filter(file => hasConflictMarkers(file));

  if (conflictFiles.length > 0) {
    console.error(chalk.red.italic("⛔ Merge conflict not resolved in:"));
    for (const file of conflictFiles) {
      console.error(chalk.red(`   - ${file}`));
    }
    console.error(chalk.yellow.italic("❌ Resolve conflicts before committing."));
    console.log(chalk.yellow.italic("AFTER RESOLVING DO (merge --continue) to auto stage and commit "))
    return;
  }

  // ✅ Load index
  const indexPath = path.join(process.cwd(), ".sHyt", "index");
  if (!fs.existsSync(indexPath)) {
    console.error(chalk.red("❌ No staged files found. Did you forget to add?"));
    return;
  }

  const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));

  // 🧱 Write tree
  const treeSha = await writeTree(index);

  // 🔗 Find parent commit
  const headPath = path.join(process.cwd(), ".sHyt", "HEAD");
  const headRef = fs.readFileSync(headPath, "utf-8").trim(); // "ref: refs/heads/main"
  const currentBranch = headRef.split(" ")[1]; // "refs/heads/main"
  const branchPath = path.join(".sHyt", currentBranch);

  let parentShas = [];
  if (fs.existsSync(branchPath)) {
    const parentSha = fs.readFileSync(branchPath, "utf-8").trim();
    if (parentSha) {
      parentShas.push(parentSha);
    }
  }

  // 🧱 Make commit object
  const commitSha = await commitTree(treeSha, message, parentShas);

  // 📝 Update branch pointer
  fs.writeFileSync(branchPath, commitSha);
  console.log(chalk.green.italic(`✅ Committed as ${commitSha}`));
}






// Utility: hash file content using SHA1
function hashFile(filePath) {                         //STATUS HELPER
  const content = fs.readFileSync(filePath);
  const header = `blob ${content.length}\x00`;
  const store = Buffer.concat([Buffer.from(header), content]);
  return crypto.createHash("sha1").update(store).digest("hex");
}


// Read .sHyt/index if exists 
function readIndex() {                                      //STATUS HELPER
  const indexPath = path.join(".sHyt", "index");
  if (!fs.existsSync(indexPath)) return [];
  return JSON.parse(fs.readFileSync(indexPath, "utf-8"));
}

// Recursively get all file paths (excluding .sHyt/)
function getAllFiles(dirPath = ".", fileList = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    // Skip .sHyt folder and .sHytignore file
    if (fullPath.startsWith(".sHyt") || fullPath === ".sHytignore") continue;

    if (entry.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }

  return fileList;
}


// Compare working directory with index
function status() {
  const indexEntries = readIndex();
  const indexMap = Object.fromEntries(indexEntries.map(e => [e.path, e.sha]));

  const workingFiles = getAllFiles();

  const staged = [];
  const modified = [];
  const untracked = [];

  for (const filePath of workingFiles) {
    const relPath = path.relative(".", filePath);
    const currentSha = hashFile(filePath);
    //  console.log(indexMap[relPath])
    //  console.log(currentSha)
    if (indexMap[relPath]) {
      if (indexMap[relPath] === currentSha) {
        staged.push(relPath);
      } else {
        modified.push(relPath);
      }
    } else {
      untracked.push(relPath);
    }
  }

  console.log(chalk.bgGreen("Staged files:"));
  staged.forEach(f => console.log(chalk.italic.green("  ✅", f)));

  console.log(chalk.bgGray("\nModified but not staged:"));
  modified.forEach(f => console.log(chalk.italic.grey("  📝", f)));

  console.log(chalk.bgYellow("\nUntracked files:"));
  untracked.forEach(f => console.log(chalk.italic.yellowBright("  🆕", f)));
}



//CREATE A NEW BRANCH
function createBranch(branchName) {
  const headContent = fs.readFileSync(path.join(".sHyt", "HEAD"), "utf8").trim();

  if (!headContent.startsWith("ref:")) {
    console.error(chalk.red("HEAD is in a detached state."));
    return;
  }

  const currentRefPath = headContent.split(" ")[1]; // e.g. refs/heads/main
  const currentBranchPath = path.join(".sHyt", currentRefPath);

  if (!fs.existsSync(currentBranchPath)) {
    console.error(chalk.red("Current branch reference not found.No initial commit was found"));
    return;
  }

  const currentCommitSha = fs.readFileSync(currentBranchPath, "utf8").trim();
  const newBranchPath = path.join(".sHyt", "refs", "heads", branchName);

  fs.mkdirSync(path.dirname(newBranchPath), { recursive: true });
  fs.writeFileSync(newBranchPath, currentCommitSha);

  console.log(chalk.green(`✅ Created branch '${branchName}' at ${currentCommitSha}`));
}


//LIST ALL THE BRANCHES
function listBranches() {
  const headsPath = path.join(".sHyt", "refs", "heads");

  try {
    const branches = fs.readdirSync(headsPath);
    // console.log(branches)
    if (branches.length === 0) {
      console.log(chalk.red("No branches found."));
    } else {
      console.log(chalk.bgGray("Branches:"));
      for (const branch of branches) {
        console.log(chalk.grey("  " + branch));
      }
    }
  } catch (err) {
    console.error(chalk.red("Error reading branches:", err.message));
  }
}




//SWITCH BETWEEN BRANCHES
function checkoutBranch(branchName) {
  const branchRef = path.join(".sHyt", "refs", "heads", branchName);

  if (!fs.existsSync(branchRef)) {
    console.error(chalk.red(`❌ Branch '${branchName}' does not exist.`));
    return;
  }

  const commitSha = fs.readFileSync(branchRef, "utf-8").trim();
  fs.writeFileSync(path.join(".sHyt", "HEAD"), `ref: refs/heads/${branchName}\n`);
  console.log(chalk.green(`✅ Switched to branch '${branchName}'`));

  restoreFromCommit(commitSha);
}

// Restore files from a commit SHA AND GET THE TREE SHA AND THEN GET THE CONTENT FROM THE TREE SHA USING HELPER FUNCTION
//RESTORE(TREESHA)
function restoreFromCommit(commitSha) {
  // console.log(commitSha)
  const buffer = readGitObject(commitSha);
  const nullIndex = buffer.indexOf(0);
  const content = buffer.slice(nullIndex + 1).toString();

  const treeLine = content.split("\n").find(line => line.startsWith("tree "));
  if (!treeLine) {
    console.error(chalk.yellow("❌ No 'tree' line found in commit!"));
    console.error(chalk.yellow("Raw commit content:\n", content));
    return;
  }

  const treeSha = treeLine.split(" ")[1].trim();
  restoreTree(treeSha);
   // ✅ this still restores
  return treeSha; 
}

// Read and decompress an object
function readGitObject(sha) {
  // console.log(sha)
  const dir = sha.slice(0, 2);
  const file = sha.slice(2);
  const objectPath = path.join(".sHyt", "objects", dir, file);

  const compressed = fs.readFileSync(objectPath);
  return zlib.unzipSync(compressed);
}

// Parse tree and restore files to working directory
function restoreTree(treeSha, basePath = ".") {
  const buffer = readGitObject(treeSha);
  const nullIndex = buffer.indexOf(0);
  const treeContent = buffer.slice(nullIndex + 1);

  let i = 0;
  while (i < treeContent.length) {
    const spaceIndex = treeContent.indexOf(32, i);
    const mode = treeContent.slice(i, spaceIndex).toString();

    const nullByteIndex = treeContent.indexOf(0, spaceIndex);
    const name = treeContent.slice(spaceIndex + 1, nullByteIndex).toString();
    const sha = treeContent.slice(nullByteIndex + 1, nullByteIndex + 21).toString("hex");

    i = nullByteIndex + 21;

    const fullPath = path.join(basePath, name);

    if (mode === "40000") {
      // It's a directory
      fs.mkdirSync(fullPath, { recursive: true });
      restoreTree(sha, fullPath);
    } else {
      // It's a file
      const blob = readGitObject(sha);
      const blobNull = blob.indexOf(0);
      const fileContent = blob.slice(blobNull + 1);

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, fileContent);
    }
  }
}


// NOW WE WILL DO THE MERGING OF BRANCH

function getCommitParents(commitSha) {
  const buffer = readGitObject(commitSha);
  const nullIndex = buffer.indexOf(0);
  const content = buffer.slice(nullIndex + 1).toString();

  const parentLines = content
    .split("\n")
    .filter(line => line.startsWith("parent "));
  
  return parentLines.map(line => line.split(" ")[1].trim());
}

function findMergeBase(commitSha1, commitSha2) {
  // Traverse ancestors of commitSha1
  const ancestors1 = new Set();
  const stack1 = [commitSha1];
  while (stack1.length) {
    const sha = stack1.pop();
    if (ancestors1.has(sha)) continue;
    ancestors1.add(sha);
    const parents = getCommitParents(sha);
    stack1.push(...parents);
  }

  // Traverse commitSha2 ancestors until common found
  const visited2 = new Set();
  const stack2 = [commitSha2];
  while (stack2.length) {
    const sha = stack2.pop();
    if (visited2.has(sha)) continue;
    visited2.add(sha);
    if (ancestors1.has(sha)) return sha; // common ancestor found
    const parents = getCommitParents(sha);
    stack2.push(...parents);
  }

  return null; // no common ancestor found (rare)
}



//HELPER FUNCTION IN mergeTreesWithConflict
async function readTreeEntries(treeSha, prefix = "") {
  const buffer = readGitObject(treeSha);
  const nullIndex = buffer.indexOf(0);
  const treeContent = buffer.slice(nullIndex + 1);

  const entries = {};
  let i = 0;

  while (i < treeContent.length) {
    const spaceIdx = treeContent.indexOf(0x20, i);
    if (spaceIdx === -1) break;

    const nullIdx = treeContent.indexOf(0x00, spaceIdx);
    if (nullIdx === -1) break;

    const mode = treeContent.slice(i, spaceIdx).toString();
    const filename = treeContent.slice(spaceIdx + 1, nullIdx).toString();
    const shaBuf = treeContent.slice(nullIdx + 1, nullIdx + 21);
    if (shaBuf.length < 20) break;

    const sha = shaBuf.toString("hex");
    const fullPath = path.join(prefix, filename);

    const header = readGitObject(sha).toString().split("\x00")[0];
    if (header.startsWith("tree")) {
      const subEntries = await readTreeEntries(sha, fullPath);
      Object.assign(entries, subEntries);
    } else {
      entries[fullPath] = { mode, sha };
    }

    i = nullIdx + 21;
  }

  return entries;
}



//HELPER FUNCTION IN mergeTreesWithConflict
async function writeTreeFromMap(entries) {
  const parts = [];

  for (const [filename, { mode, sha }] of Object.entries(entries)) {
    const modeBuf = Buffer.from(mode + " ");
    const nameBuf = Buffer.from(filename);
    const shaBuf = Buffer.from(sha, "hex");
    const nullByte = Buffer.from([0]);

    parts.push(Buffer.concat([modeBuf, nameBuf, nullByte, shaBuf]));
  }

  const treeContent = Buffer.concat(parts);
  const header = Buffer.from(`tree ${treeContent.length}\x00`);
  const fullBuffer = Buffer.concat([header, treeContent]);

  const treeSha = crypto.createHash("sha1").update(fullBuffer).digest("hex");
  const folder = treeSha.slice(0, 2);
  const file = treeSha.slice(2);
  const dir = path.join(".sHyt", "objects", folder);
  await fs.mkdirSync(dir, { recursive: true });
  await fs.writeFileSync(path.join(dir, file), zlib.deflateSync(fullBuffer));

  return treeSha;
}




async function mergeTreesWithConflict(treeSha1, treeSha2, baseTreeSha = null) {
  const entries1 = await readTreeEntries(treeSha1); // Current branch
  const entries2 = await readTreeEntries(treeSha2); // Merging branch
  const baseEntries = baseTreeSha ? await readTreeEntries(baseTreeSha) : {};

  const merged = {};
  const allFiles = new Set([...Object.keys(entries1), ...Object.keys(entries2)]);

  for (const file of allFiles) {
    const entry1 = entries1[file];
    const entry2 = entries2[file];
    const baseEntry = baseEntries[file];

    if (!entry1) {
      // Added in branch 2
      merged[file] = entry2;
    } else if (!entry2) {
      // Deleted in branch 2
      merged[file] = entry1;
    } else if (entry1.sha === entry2.sha) {
      // Same in both
      merged[file] = entry1;
    } else if (baseEntry && entry1.sha === baseEntry.sha) {
      // Changed only in branch 2
      merged[file] = entry2;
    } else if (baseEntry && entry2.sha === baseEntry.sha) {
      // Changed only in branch 1
      merged[file] = entry1;
    } else {
      // Conflict: both modified differently
      console.warn(chalk.red.bold(`⚠️ CONFLCIT IN ${file}`));


 const content1 = getBlobContent(entry1.sha); // get actual text
const content2 = getBlobContent(entry2.sha); // get actual text

const conflictContent = `<<<<<<< CURRENT\n${content1}\n=======\n${content2}\n>>>>>>> MERGING\n`;
const contentBuffer = Buffer.from(conflictContent, 'utf-8'); // force utf-8

const header = Buffer.from(`blob ${contentBuffer.length}\x00`);
const fullBlob = Buffer.concat([header, contentBuffer]);




const compressed = zlib.deflateSync(fullBlob);
const sha = crypto.createHash("sha1").update(fullBlob).digest("hex");

const folder = sha.slice(0, 2);
const fileName = sha.slice(2);
const dir = path.join(".sHyt", "objects", folder);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, fileName), compressed);

merged[file] = { mode: entry1.mode, sha };

    }
  }

  return await writeTreeFromMap(merged);
}


function getBlobContent(sha) {
  const buffer = readGitObject(sha); // already decompressed
  const nullIndex = buffer.indexOf(0);
  const contentBuffer = buffer.slice(nullIndex + 1);

  // Check for UTF-16 LE BOM (0xFF 0xFE)
  if (contentBuffer[0] === 0xFF && contentBuffer[1] === 0xFE) {
    console.warn(chalk.yellow("🔍 Detected UTF-16 LE encoding, decoding..."));
    const decoded = contentBuffer.toString("utf16le");
    return decoded.replace(/^\uFEFF/, ""); // Strip BOM if present
  }

  // UTF-8 fallback
  const decoded = contentBuffer.toString("utf8");
  return decoded.replace(/^\uFEFF/, ""); // Strip UTF-8 BOM if somehow present
}




async function mergeBranch(branchName) {
  const headContent = fs.readFileSync(path.join(".sHyt", "HEAD"), "utf-8").trim();
 const headRef = headContent.replace("ref: ", ""); // 'refs/heads/main'
 const currentBranch = path.basename(headRef);     // 'main'
  const currentRefPath = path.join(".sHyt", headRef.replace("ref: ", ""));
  const targetRefPath = path.join(".sHyt", "refs", "heads", branchName);

  if (!fs.existsSync(targetRefPath)) {
    console.error(chalk.red(`❌ Branch '${branchName}' does not exist.`));
    return;
  }

  const currentCommitSha = fs.readFileSync(currentRefPath, "utf-8").trim();
  const targetCommitSha = fs.readFileSync(targetRefPath, "utf-8").trim();
  const currentTreeSha = restoreFromCommit(currentCommitSha);
  const targetTreeSha = restoreFromCommit(targetCommitSha);

  // Find merge base commit and its tree SHA
  const baseCommitSha = findMergeBase(currentCommitSha, targetCommitSha);
  const baseTreeSha = baseCommitSha ? restoreFromCommit(baseCommitSha) : null;

  const mergedTreeSha = await mergeTreesWithConflict(currentTreeSha, targetTreeSha, baseTreeSha);

  const mergeMessage = `Merge branch '${branchName}' into '${currentBranch}'`;
  const mergeSha = await commitTree(mergedTreeSha, mergeMessage, [currentCommitSha, targetCommitSha]);

  fs.writeFileSync(currentRefPath, mergeSha);
  console.log(chalk.green(`✅ Merged branch '${branchName}' into '${currentBranch}'`));
  console.log(chalk.green(`🆕 Created merge commit ${mergeSha}`));
  restoreFromCommit(mergeSha);
}

//YE PURA KAAM KARTA HAI

async function mergeContinue() {
  const allFiles = getAllFiles(".");
  const conflicted = allFiles.filter(hasConflictMarkers);

  if (conflicted.length > 0) {
    console.error(chalk.red.italic("⛔ CANNOT CONTINUE MERGE.CONFLICTS STILL PRESENT IN:"));
    conflicted.forEach(file => console.error(chalk.red(`  - ${file}`)));
    console.error(chalk.red.italic("🛠️ REMOVE ALL CONFLICTS BEFORE RUNNING 'merge --continue'."));
    return;
  }

  // Stage all resolved files
  console.log(chalk.green("✅ No conflicts detected. Staging files..."));
  await addPath(".");

  // Auto commit the merge
  console.log(chalk.green("✅ Staged. Creating merge commit..."));
  await commit(["-m", "Merge resolved"]);
}


function currentBranch() {
    try{
          const headPath = path.join(".sHyt", "HEAD");

  if (!fs.existsSync(headPath)) {
    console.error(chalk.red("❌ CANNOT READ THE HEAD POINTER."));
    return null;
  }

  const headContent = fs.readFileSync(headPath, "utf-8").trim();
  if (headContent.startsWith("ref: ")) {
    return path.basename(headContent.slice(5)); // e.g., 'refs/heads/main' → 'main'
  } else {
    console.log(chalk.yellow("📍 Detached HEAD state (not on any branch)"));
    return null;
  }
    }
  catch(e){
    console.error(chalk.red(e.message))
  }

}

function unstage(filePath) {
  const indexPath = path.join(".sHyt", "index");

  if (!fs.existsSync(indexPath)) {
    console.error(chalk.red("❌ Index file missing. Did you run 'init'?"));
    return;
  }

  let index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));

  if (filePath === ".") {
    // Unstage everything
    if (index.length === 0) {
      console.warn(chalk.yellowBright("⚠️ No files are staged."));
    } else {
      fs.writeFileSync(indexPath, JSON.stringify([], null, 2));
      console.log(chalk.yellow(`🧹 Unstaged all ${index.length} files.`));
    }
    return;
  }

  // Unstage specific file
  const initialLength = index.length;
  index = index.filter(entry => entry.path !== filePath);

  if (index.length === initialLength) {
    console.warn(chalk.yellowBright(`⚠️ ${filePath} is not staged.`));
  } else {
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log(chalk.yellow(`🧹 Unstaged ${filePath}`));
  }
}


async function diffBranches(branchA, branchB) {
  const refA = path.join(".sHyt", "refs", "heads", branchA);
  const refB = path.join(".sHyt", "refs", "heads", branchB);

  if (!fs.existsSync(refA) || !fs.existsSync(refB)) {
    console.error(chalk.red("❌ One or both branches do not exist."));
    return;
  }

  const shaA = fs.readFileSync(refA, "utf-8").trim();
  const shaB = fs.readFileSync(refB, "utf-8").trim();

  const treeA = restoreFromCommit(shaA);
  const treeB = restoreFromCommit(shaB);

  const entriesA = await readTreeEntries(treeA);
  const entriesB = await readTreeEntries(treeB);

  const allFiles = new Set([...Object.keys(entriesA), ...Object.keys(entriesB)]);

  console.log(chalk.blue(`📂 Diff between '${branchA}' and '${branchB}':`));

  for (const file of allFiles) {
    const a = entriesA[file];
    const b = entriesB[file];

    if (!a) {
      console.log(chalk.green(`🟢 ${file} (added)`));
    } else if (!b) {
      console.log(chalk.red(`🔴 ${file} (removed)`));
    } else if (a.sha !== b.sha) {
      console.log(chalk.yellow(`🟡 ${file} (modified)`));

      const contentA = getBlobContent(a.sha).split("\n");
      const contentB = getBlobContent(b.sha).split("\n");

      const patch = diff.createPatch(file, contentA.join("\n"), contentB.join("\n"));

      const lines = patch.split("\n").slice(4); // Skip metadata

      for (const line of lines) {
        if (line.startsWith("-")) {
          console.log(chalk.red(line));
        } else if (line.startsWith("+")) {
          console.log(chalk.green(line));
        } else {
          console.log(" " + line); // context
        }
      }
    }
  }
}

