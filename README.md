# GitHub Enterprise Users Export

This script exports all users from a GitHub Enterprise Account to a CSV file using the GitHub GraphQL API.

## Features

- Exports user information similar to the Enterprise Portal CSV export
- Uses GraphQL to minimize API rate limit impact
- Handles pagination for large enterprises (15k+ users)
- Includes organization membership details and roles
- Exports 2FA status and authentication methods
- Includes email addresses for verified domains
- Progress tracking during export

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file with your GitHub Enterprise settings:

   ```
   GITHUB_TOKEN=your_github_token_here
   ENTERPRISE_SLUG=your-enterprise-slug
   ```

3. Create a GitHub Personal Access Token with the following scopes:

   - `read:enterprise`
   - `read:org`
   - `read:user`

4. Test your connection:
   ```bash
   npm test
   ```

## Usage

### Basic Export (Recommended to start with)

Run the basic export that gets core user information:

```bash
npm run basic
```

This creates `enterprise-users-export-basic.csv` with essential user data.

### Full Export (Requires additional permissions)

Run the full export that attempts to get 2FA status and SAML data:

```bash
npm start
```

This creates `enterprise-users-export.csv` with all available user data.

## CSV Output Columns

The exported CSV includes the following columns (matching Enterprise Portal format):

- **login**: User's GitHub login/username
- **name**: User's display name
- **email**: Primary email address
- **role**: Role in enterprise (MEMBER, OWNER)
- **two_factor_enabled**: Whether 2FA is enabled
- **two_factor_method_security**: 2FA method security level
- **organizations**: List of organizations user belongs to
- **organization_roles**: Role in each organization (MEMBER, ADMIN)
- **saml_name_id**: SAML NameID if SAML SSO is configured
- **verified_domain_emails**: Email addresses for verified domains
- **enterprise_server_user_ids**: Associated Enterprise Server user IDs
- **created_at**: When the user account was created
- **updated_at**: When the user account was last updated

## Rate Limiting

The script uses GraphQL to efficiently fetch data and includes:

- Batch processing of users (100 per request)
- Automatic pagination handling
- Rate limit detection and backoff
- Progress reporting

## Requirements

- Node.js 14+
- GitHub Enterprise Cloud account
- Personal Access Token with enterprise read permissions
