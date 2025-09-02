# VS Code Testing Guide

This guide walks you through testing the GitHub Enterprise Users Export script directly in VS Code.

## 🚀 Quick Start Testing in VS Code

### Step 1: Open the Project in VS Code

```bash
code .
```

Or if you're already in VS Code:

- File → Open Folder → Select the project directory

### Step 2: Set Up Environment Variables

1. **Copy the environment template:**

   - Right-click on `.env.example` in VS Code Explorer
   - Select "Copy"
   - Right-click in empty space and "Paste"
   - Rename the copy to `.env`

2. **Edit the `.env` file:**
   ```
   GITHUB_TOKEN=ghp_your_actual_token_here
   ENTERPRISE_SLUG=your-enterprise-slug
   ```

### Step 3: Install Dependencies

Open VS Code's integrated terminal (` Ctrl+``  ` or `View → Terminal`) and run:

```bash
npm install
```

### Step 4: Test Connection

```bash
npm test
```

This will validate your setup and show you what data is available.

## 🧪 Testing Options

### Option 1: Quick Connection Test

```bash
npm test
```

**What it does:**

- Validates your GitHub token and enterprise access
- Shows sample user data (first 3 users)
- Checks rate limit status
- Tests advanced permissions (2FA/SAML data)

### Option 2: Basic Export Test

```bash
npm run basic
```

**What it does:**

- Exports core user information without sensitive data
- Works with standard enterprise member permissions
- Creates `enterprise-users-export-basic.csv`
- Good for first-time testing

### Option 3: Full Export Test

```bash
npm start
```

**What it does:**

- Attempts full export including 2FA and SAML data
- Requires organization admin permissions
- Creates `enterprise-users-export.csv`
- Use after basic test succeeds

## 📋 VS Code Extensions (Recommended)

Install these extensions for better development experience:

1. **Thunder Client** (`rangav.vscode-thunder-client`)

   - Test GraphQL queries directly in VS Code
   - Great for experimenting with API calls

2. **REST Client** (`humao.rest-client`)

   - Alternative for testing API calls
   - Simple .http file format

3. **CSV Rainbow** (`mechatroner.rainbow-csv`)

   - Better visualization of exported CSV files
   - Syntax highlighting for CSV data

4. **GitLens** (`eamodio.gitlens`)
   - Enhanced Git capabilities
   - Useful if you want to version control your exports

## 🔍 Step-by-Step Debugging

### 1. Test GitHub Token

Create a new file `test-token.js`:

```javascript
const { graphql } = require("@octokit/graphql");
require("dotenv").config();

async function testToken() {
  try {
    const result = await graphql(
      `
        query {
          viewer {
            login
            name
          }
        }
      `,
      {
        headers: {
          authorization: `token ${process.env.GITHUB_TOKEN}`,
        },
      }
    );

    console.log("✅ Token works!", result.viewer);
  } catch (error) {
    console.error("❌ Token failed:", error.message);
  }
}

testToken();
```

Run with: `node test-token.js`

### 2. Test Enterprise Access

Create `test-enterprise.js`:

```javascript
const { graphql } = require("@octokit/graphql");
require("dotenv").config();

async function testEnterprise() {
  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  });

  try {
    const result = await graphqlWithAuth(
      `
      query($slug: String!) {
        enterprise(slug: $slug) {
          name
          members { totalCount }
        }
      }
    `,
      {
        slug: process.env.ENTERPRISE_SLUG,
      }
    );

    console.log("✅ Enterprise access works!");
    console.log(`Enterprise: ${result.enterprise.name}`);
    console.log(`Members: ${result.enterprise.members.totalCount}`);
  } catch (error) {
    console.error("❌ Enterprise access failed:", error.message);
  }
}

testEnterprise();
```

Run with: `node test-enterprise.js`

### 3. Use Thunder Client for GraphQL Testing

1. Install Thunder Client extension
2. Create new request
3. Set method to POST
4. URL: `https://api.github.com/graphql`
5. Headers:
   ```json
   {
     "Authorization": "token YOUR_GITHUB_TOKEN",
     "Content-Type": "application/json"
   }
   ```
6. Body (JSON):
   ```json
   {
     "query": "query($slug: String!) { enterprise(slug: $slug) { name members { totalCount } } }",
     "variables": {
       "slug": "YOUR_ENTERPRISE_SLUG"
     }
   }
   ```

## 🐛 Common Issues & Solutions

### Issue 1: "Module not found"

**Solution:** Make sure you ran `npm install`

```bash
npm install
```

### Issue 2: "Bad credentials"

**Solution:** Check your GitHub token in `.env`

- Make sure token starts with `ghp_`
- Verify token has required scopes
- Check for extra spaces/newlines

### Issue 3: "Enterprise not found"

**Solution:** Verify your enterprise slug

- Check the URL when you visit your enterprise
- Use the slug from: `https://github.com/enterprises/YOUR-SLUG`

### Issue 4: "Rate limit exceeded"

**Solution:** Wait for rate limit reset

```bash
# Check current rate limit
curl -H "Authorization: token YOUR_TOKEN" \
     https://api.github.com/rate_limit
```

## 📊 VS Code Tasks for Testing

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Test Connection",
      "type": "shell",
      "command": "npm",
      "args": ["test"],
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "Basic Export",
      "type": "shell",
      "command": "npm",
      "args": ["run", "basic"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "Full Export",
      "type": "shell",
      "command": "npm",
      "args": ["start"],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    }
  ]
}
```

Access tasks with: `Ctrl+Shift+P` → "Tasks: Run Task"

## 🎯 Testing Workflow

1. **Start Small:** `npm test` (validates connection)
2. **Test Basic:** `npm run basic` (exports sample data)
3. **Check Output:** Open the generated CSV file in VS Code
4. **Scale Up:** `npm start` (full export if needed)
5. **Debug Issues:** Use individual test files above

## 📁 Files You'll See After Testing

```
GetUsers/
├── .env                           # Your secrets (don't commit!)
├── enterprise-users-export-basic.csv  # Basic export output
├── enterprise-users-export.csv        # Full export output
├── node_modules/                  # Dependencies
└── ... (original files)
```

## 🔒 Security Notes

- The `.env` file is gitignored - your secrets are safe
- Never commit your GitHub token to version control
- Consider using VS Code's built-in secrets management for tokens

## 💡 Pro Tips

1. **Use VS Code's built-in terminal** - keeps everything in one place
2. **Install CSV extension** - makes viewing export files much better
3. **Use Command Palette** (`Ctrl+Shift+P`) for quick task running
4. **Split terminal** if you want to keep one terminal running while testing
5. **Use VS Code's search** to quickly find and replace tokens/slugs in code
