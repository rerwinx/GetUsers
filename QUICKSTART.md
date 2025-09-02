# Quick Start Guide

## 1. Initial Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env file with your details:
# GITHUB_TOKEN=your_github_personal_access_token
# ENTERPRISE_SLUG=your-enterprise-slug
```

## 2. Test Connection

```bash
npm test
```

## 3. Run Export

```bash
# Basic export (recommended for first run)
npm run basic

# Full export (if you have admin permissions)
npm start
```

## Personal Access Token Scopes Required

Your GitHub token needs these scopes:

- ✅ `read:enterprise` - Read enterprise information
- ✅ `read:org` - Read organization membership data
- ✅ `read:user` - Read user profile information

## Finding Your Enterprise Slug

Your enterprise slug is in the URL when you visit your enterprise:

- URL: `https://github.com/enterprises/YOUR-ENTERPRISE-SLUG`
- Use: `YOUR-ENTERPRISE-SLUG`

## Expected Output Files

### Basic Export (`npm run basic`)

- File: `enterprise-users-export-basic.csv`
- Contains: Username, email, organizations, basic profile info
- Works with: Standard enterprise member permissions

### Full Export (`npm start`)

- File: `enterprise-users-export.csv`
- Contains: Everything from basic + 2FA status, SAML data
- Requires: Organization admin permissions for full data

## Troubleshooting

### Error: "Enterprise not found"

- Check your `ENTERPRISE_SLUG` in .env
- Ensure your token has access to the enterprise

### Error: "Bad credentials" or "Unauthorized"

- Check your `GITHUB_TOKEN` in .env
- Verify token has required scopes
- Make sure token hasn't expired

### Error: "Rate limit exceeded"

- Wait for rate limit reset (shown in error)
- The script includes rate limit handling

### Missing 2FA/SAML data

- This requires organization admin permissions
- Use basic export if you don't have admin access

## Large Enterprise Tips

For enterprises with 15,000+ users:

- Expect 10-30 minutes for full export
- The script shows progress during export
- Uses GraphQL batching to minimize API calls
- Includes automatic rate limit handling

## Sample Output

Basic export includes columns like:

```
Username,Display Name,Email,Company,Organizations,Organization Roles,Created At
octocat,The Octocat,octocat@github.com,GitHub,myorg; anotherorg,myorg: MEMBER; anotherorg: ADMIN,2011-01-25T18:44:36Z
```

## Command Reference

```bash
npm run help    # Show all available commands
npm test        # Test API connection and permissions
npm run basic   # Basic user export (safe for all users)
npm start       # Full export with advanced data (needs admin perms)
```
