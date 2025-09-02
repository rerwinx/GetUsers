# GitHub Enterprise Users Export - Technical Documentation

This document provides detailed technical information about the API calls, data structures, and implementation for developers who want to understand, modify, or recreate this code in other languages.

## Table of Contents

- [API Overview](#api-overview)
- [GraphQL Queries](#graphql-queries)
- [Data Structures](#data-structures)
- [Implementation Flow](#implementation-flow)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Alternative Implementations](#alternative-implementations)
- [Performance Optimization](#performance-optimization)
- [Security Considerations](#security-considerations)

## API Overview

### Endpoint and Authentication

- **API Endpoint:** `https://api.github.com/graphql`
- **Method:** `POST`
- **Authentication:** Bearer token in Authorization header
- **Content-Type:** `application/json`

### Required Token Scopes

| Scope             | Purpose                              | Required For          |
| ----------------- | ------------------------------------ | --------------------- |
| `read:enterprise` | Access enterprise member list        | All functionality     |
| `read:org`        | Read organization membership details | Organization roles    |
| `read:user`       | Read user profile information        | User details          |
| `admin:org`       | Read sensitive org data              | 2FA status, SAML data |

## GraphQL Queries

### 1. Primary Enterprise Members Query

This is the main query that retrieves enterprise members in batches:

```graphql
query GetEnterpriseMembers(
  $enterpriseSlug: String!
  $cursor: String
  $batchSize: Int!
) {
  enterprise(slug: $enterpriseSlug) {
    name # Enterprise display name
    description # Enterprise description
    members(first: $batchSize, after: $cursor) {
      totalCount # Total number of members (for progress tracking)
      pageInfo {
        hasNextPage # Whether more pages exist
        endCursor # Cursor for next page
      }
      nodes {
        ... on EnterpriseUserAccount {
          # Enterprise-level user account info
          login # Enterprise account login
          name # Enterprise account display name
          createdAt # When enterprise account was created
          updatedAt # When enterprise account was last updated
          # GitHub.com user account (may be null for some enterprise types)
          user {
            login # GitHub username
            name # GitHub display name
            email # Primary email address
            createdAt # GitHub account creation date
            updatedAt # Last profile update
            isSiteAdmin # Whether user is a GitHub Enterprise Server admin
            company # Company from profile
            location # Location from profile
            websiteUrl # Website from profile
            twitterUsername # Twitter handle from profile
          }

          # Organization memberships within the enterprise
          organizations(first: 50) {
            totalCount # Number of organizations user belongs to
            edges {
              role # User's role in this org (MEMBER, ADMIN, OWNER)
              node {
                login # Organization username/slug
                name # Organization display name
                description # Organization description
                email # Organization public email
                websiteUrl # Organization website
                location # Organization location
                createdAt # Organization creation date
              }
            }
          }
        }
      }
    }
  }
}
```

**Variables:**

```json
{
  "enterpriseSlug": "your-enterprise-slug",
  "cursor": null, // null for first page, use endCursor for subsequent pages
  "batchSize": 100 // Maximum 100 per GraphQL best practices
}
```

### 2. Organization Member Details Query

This query retrieves sensitive member information that requires organization admin permissions:

```graphql
query GetOrganizationMemberDetails($login: String!, $orgLogin: String!) {
  organization(login: $orgLogin) {
    # 2FA status for the user in this organization
    membersWithRole(query: $login, first: 1) {
      edges {
        hasTwoFactorEnabled # Boolean: whether 2FA is enabled
        node {
          login # Username (for verification)
        }
      }
    }

    # SAML SSO information if configured
    samlIdentityProvider {
      externalIdentities(login: $login, first: 1) {
        nodes {
          samlIdentity {
            nameId # SAML NameID attribute
          }
        }
      }
    }
  }
}
```

**Variables:**

```json
{
  "login": "username",
  "orgLogin": "organization-name"
}
```

### 3. Rate Limit Check Query

Used to monitor API usage:

```graphql
query GetRateLimit {
  rateLimit {
    limit # Maximum requests per hour (usually 5000)
    remaining # Requests remaining in current window
    resetAt # ISO 8601 timestamp when limit resets
  }
}
```

### 4. Enterprise Validation Query

Used for initial connection testing:

```graphql
query ValidateEnterprise($enterpriseSlug: String!) {
  enterprise(slug: $enterpriseSlug) {
    name # Enterprise name
    slug # Enterprise slug
    description # Enterprise description
    members {
      totalCount # Total member count
    }
  }
}
```

## Data Structures

### Enterprise Response Structure

```typescript
interface EnterpriseResponse {
  enterprise: {
    name: string;
    description: string | null;
    members: {
      totalCount: number;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: EnterpriseUserAccount[];
    };
  };
}

interface EnterpriseUserAccount {
  login: string;
  name: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  user: GitHubUser | null;
  organizations: {
    totalCount: number;
    edges: OrganizationMembership[];
  };
}

interface GitHubUser {
  login: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  isSiteAdmin: boolean;
  company: string | null;
  location: string | null;
  websiteUrl: string | null;
  twitterUsername: string | null;
}

interface OrganizationMembership {
  role: "MEMBER" | "ADMIN" | "OWNER";
  node: {
    login: string;
    name: string | null;
    description: string | null;
    email: string | null;
    websiteUrl: string | null;
    location: string | null;
    createdAt: string;
  };
}
```

### CSV Output Mapping

```typescript
interface CSVRow {
  login: string; // user.login || login
  name: string; // user.name || name || ''
  email: string; // user.email || ''
  company: string; // user.company || ''
  location: string; // user.location || ''
  website_url: string; // user.websiteUrl || ''
  twitter_username: string; // user.twitterUsername || ''
  is_site_admin: boolean; // user.isSiteAdmin || false
  organizations_count: number; // organizations.totalCount
  organizations: string; // organizations.edges[].node.login.join('; ')
  organization_roles: string; // organizations.edges[].{node.login}:{role}.join('; ')
  created_at: string; // user.createdAt || createdAt
  updated_at: string; // user.updatedAt || updatedAt
  two_factor_enabled?: string; // From organization query (requires admin)
  saml_name_id?: string; // From SAML identity provider (requires admin)
}
```

## Implementation Flow

### 1. Initialization Phase

```javascript
// 1. Load environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ENTERPRISE_SLUG = process.env.ENTERPRISE_SLUG;

// 2. Initialize GraphQL client with authentication
const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${GITHUB_TOKEN}`,
  },
});

// 3. Validate enterprise access
const validation = await graphqlWithAuth(VALIDATE_QUERY, { enterpriseSlug });
```

### 2. Data Collection Phase

```javascript
let allUsers = [];
let cursor = null;
let hasNextPage = true;

// Get total count for progress tracking
const initialResult = await graphqlWithAuth(MEMBERS_QUERY, {
  enterpriseSlug: ENTERPRISE_SLUG,
  cursor: null,
  batchSize: 1,
});
const totalUsers = initialResult.enterprise.members.totalCount;

// Paginate through all members
while (hasNextPage) {
  const result = await graphqlWithAuth(MEMBERS_QUERY, {
    enterpriseSlug: ENTERPRISE_SLUG,
    cursor: cursor,
    batchSize: 100,
  });

  const members = result.enterprise.members.nodes;
  allUsers = allUsers.concat(members);

  hasNextPage = result.enterprise.members.pageInfo.hasNextPage;
  cursor = result.enterprise.members.pageInfo.endCursor;

  // Progress tracking
  console.log(`Processed ${allUsers.length}/${totalUsers} users`);

  // Rate limit courtesy delay
  await sleep(200);
}
```

### 3. Data Enhancement Phase (Optional)

```javascript
// For users with organization admin permissions
for (const user of allUsers) {
  if (user.organizations.edges.length > 0) {
    const firstOrg = user.organizations.edges[0].node.login;

    try {
      const details = await graphqlWithAuth(ORG_DETAILS_QUERY, {
        login: user.login,
        orgLogin: firstOrg,
      });

      // Extract 2FA and SAML data
      user.twoFactorEnabled =
        details.organization?.membersWithRole?.edges?.[0]?.hasTwoFactorEnabled;
      user.samlNameId =
        details.organization?.samlIdentityProvider?.externalIdentities?.nodes?.[0]?.samlIdentity?.nameId;
    } catch (error) {
      // Gracefully handle permission errors
      console.warn(`Could not get enhanced data for ${user.login}`);
    }
  }
}
```

### 4. CSV Generation Phase

```javascript
const csvWriter = createCsvWriter({
  path: outputFile,
  header: csvHeaders,
});

const csvData = allUsers.map((user) => ({
  login: user.user?.login || user.login,
  name: user.user?.name || user.name || "",
  email: user.user?.email || "",
  // ... map all other fields
  organizations: user.organizations.edges
    .map((edge) => edge.node.login)
    .join("; "),
  organization_roles: user.organizations.edges
    .map((edge) => `${edge.node.login}: ${edge.role}`)
    .join("; "),
}));

await csvWriter.writeRecords(csvData);
```

## Rate Limiting

### GraphQL Rate Limits

- **Limit:** 5,000 points per hour
- **Cost:** ~1 point per 100 users retrieved
- **Reset:** Every hour from first request

### Rate Limit Handling

```javascript
// Check rate limit before starting
const rateLimit = await graphqlWithAuth(`
  query { rateLimit { remaining resetAt } }
`);

if (rateLimit.rateLimit.remaining < 100) {
  console.warn("Low rate limit remaining");
}

// Handle rate limit exceeded errors
try {
  const result = await graphqlWithAuth(query, variables);
} catch (error) {
  if (error.message.includes("rate limit")) {
    const resetTime = new Date(
      error.response?.headers?.["x-ratelimit-reset"] * 1000
    );
    console.log(`Rate limited until ${resetTime}`);
    // Wait until reset or implement exponential backoff
  }
}
```

### Optimization Strategies

1. **Batch Size:** Use maximum batch size (100) to minimize requests
2. **Field Selection:** Only request needed fields to reduce response size
3. **Cursor Pagination:** More efficient than offset pagination
4. **Request Spacing:** Add small delays between requests for courtesy

## Error Handling

### Common Errors and Solutions

| Error Type     | HTTP Status | Cause                    | Solution                            |
| -------------- | ----------- | ------------------------ | ----------------------------------- |
| Authentication | 401         | Invalid token            | Verify token and scopes             |
| Authorization  | 403         | Insufficient permissions | Check enterprise access             |
| Not Found      | 404         | Invalid enterprise slug  | Verify enterprise slug              |
| Rate Limited   | 403         | Too many requests        | Wait for reset or implement backoff |
| Server Error   | 500         | GitHub API issues        | Retry with exponential backoff      |

### Error Handling Implementation

```javascript
async function makeGraphQLRequest(query, variables, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await graphqlWithAuth(query, variables);
    } catch (error) {
      if (error.message.includes("rate limit")) {
        // Extract reset time and wait
        const resetTime = error.response?.headers?.["x-ratelimit-reset"];
        if (resetTime) {
          const waitTime = resetTime * 1000 - Date.now();
          await sleep(Math.max(waitTime, 0));
          continue;
        }
      }

      if (attempt === retries) {
        throw error;
      }

      // Exponential backoff
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
}
```

## Alternative Implementations

### Python Implementation

```python
import requests
import csv
import time
from typing import List, Dict, Optional

class GitHubEnterpriseExporter:
    def __init__(self, token: str, enterprise_slug: str):
        self.token = token
        self.enterprise_slug = enterprise_slug
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'token {token}',
            'Content-Type': 'application/json'
        })
        self.endpoint = 'https://api.github.com/graphql'

    def make_request(self, query: str, variables: Dict) -> Dict:
        """Make GraphQL request with error handling"""
        payload = {
            'query': query,
            'variables': variables
        }

        response = self.session.post(self.endpoint, json=payload)
        response.raise_for_status()

        data = response.json()
        if 'errors' in data:
            raise Exception(f"GraphQL errors: {data['errors']}")

        return data['data']

    def get_all_members(self) -> List[Dict]:
        """Retrieve all enterprise members with pagination"""
        query = """
        query($enterpriseSlug: String!, $cursor: String, $batchSize: Int!) {
          enterprise(slug: $enterpriseSlug) {
            members(first: $batchSize, after: $cursor) {
              totalCount
              pageInfo { hasNextPage endCursor }
              nodes {
                ... on EnterpriseUserAccount {
                  login name createdAt updatedAt
                  user {
                    login name email company location
                    websiteUrl twitterUsername isSiteAdmin
                  }
                  organizations(first: 50) {
                    edges {
                      role
                      node { login name }
                    }
                  }
                }
              }
            }
          }
        }
        """

        all_members = []
        cursor = None
        has_next_page = True

        while has_next_page:
            variables = {
                'enterpriseSlug': self.enterprise_slug,
                'cursor': cursor,
                'batchSize': 100
            }

            result = self.make_request(query, variables)
            members = result['enterprise']['members']['nodes']
            all_members.extend(members)

            page_info = result['enterprise']['members']['pageInfo']
            has_next_page = page_info['hasNextPage']
            cursor = page_info['endCursor']

            print(f"Retrieved {len(all_members)} members so far...")
            time.sleep(0.2)  # Rate limiting courtesy

        return all_members

    def export_to_csv(self, filename: str):
        """Export all members to CSV file"""
        members = self.get_all_members()

        with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = [
                'login', 'name', 'email', 'company', 'location',
                'website_url', 'twitter_username', 'is_site_admin',
                'organizations_count', 'organizations', 'organization_roles',
                'created_at', 'updated_at'
            ]

            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()

            for member in members:
                user = member.get('user', {}) or {}
                orgs = member.get('organizations', {}).get('edges', [])

                row = {
                    'login': user.get('login') or member.get('login', ''),
                    'name': user.get('name') or member.get('name', ''),
                    'email': user.get('email', ''),
                    'company': user.get('company', ''),
                    'location': user.get('location', ''),
                    'website_url': user.get('websiteUrl', ''),
                    'twitter_username': user.get('twitterUsername', ''),
                    'is_site_admin': user.get('isSiteAdmin', False),
                    'organizations_count': len(orgs),
                    'organizations': '; '.join([org['node']['login'] for org in orgs]),
                    'organization_roles': '; '.join([f"{org['node']['login']}: {org['role']}" for org in orgs]),
                    'created_at': user.get('createdAt') or member.get('createdAt', ''),
                    'updated_at': user.get('updatedAt') or member.get('updatedAt', '')
                }

                writer.writerow(row)

        print(f"Exported {len(members)} members to {filename}")

# Usage
if __name__ == "__main__":
    import os

    token = os.getenv('GITHUB_TOKEN')
    enterprise_slug = os.getenv('ENTERPRISE_SLUG')

    exporter = GitHubEnterpriseExporter(token, enterprise_slug)
    exporter.export_to_csv('enterprise_members.csv')
```

### Go Implementation

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "os"
    "time"
)

type GraphQLRequest struct {
    Query     string                 `json:"query"`
    Variables map[string]interface{} `json:"variables"`
}

type EnterpriseResponse struct {
    Data struct {
        Enterprise struct {
            Name    string `json:"name"`
            Members struct {
                TotalCount int `json:"totalCount"`
                PageInfo   struct {
                    HasNextPage bool   `json:"hasNextPage"`
                    EndCursor   string `json:"endCursor"`
                } `json:"pageInfo"`
                Nodes []EnterpriseUserAccount `json:"nodes"`
            } `json:"members"`
        } `json:"enterprise"`
    } `json:"data"`
}

type EnterpriseUserAccount struct {
    Login     string    `json:"login"`
    Name      *string   `json:"name"`
    CreatedAt time.Time `json:"createdAt"`
    UpdatedAt time.Time `json:"updatedAt"`
    User      *struct {
        Login           string  `json:"login"`
        Name            *string `json:"name"`
        Email           *string `json:"email"`
        Company         *string `json:"company"`
        Location        *string `json:"location"`
        WebsiteUrl      *string `json:"websiteUrl"`
        TwitterUsername *string `json:"twitterUsername"`
        IsSiteAdmin     bool    `json:"isSiteAdmin"`
    } `json:"user"`
    Organizations struct {
        Edges []struct {
            Role string `json:"role"`
            Node struct {
                Login string  `json:"login"`
                Name  *string `json:"name"`
            } `json:"node"`
        } `json:"edges"`
    } `json:"organizations"`
}

func makeGraphQLRequest(token, query string, variables map[string]interface{}) (*http.Response, error) {
    reqBody := GraphQLRequest{
        Query:     query,
        Variables: variables,
    }

    jsonBody, err := json.Marshal(reqBody)
    if err != nil {
        return nil, err
    }

    req, err := http.NewRequest("POST", "https://api.github.com/graphql", bytes.NewBuffer(jsonBody))
    if err != nil {
        return nil, err
    }

    req.Header.Set("Authorization", "token "+token)
    req.Header.Set("Content-Type", "application/json")

    client := &http.Client{Timeout: 30 * time.Second}
    return client.Do(req)
}

func main() {
    token := os.Getenv("GITHUB_TOKEN")
    enterpriseSlug := os.Getenv("ENTERPRISE_SLUG")

    if token == "" || enterpriseSlug == "" {
        fmt.Println("Please set GITHUB_TOKEN and ENTERPRISE_SLUG environment variables")
        os.Exit(1)
    }

    query := `
    query($enterpriseSlug: String!, $cursor: String, $batchSize: Int!) {
      enterprise(slug: $enterpriseSlug) {
        members(first: $batchSize, after: $cursor) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            ... on EnterpriseUserAccount {
              login name createdAt updatedAt
              user {
                login name email company location
                websiteUrl twitterUsername isSiteAdmin
              }
              organizations(first: 50) {
                edges {
                  role
                  node { login name }
                }
              }
            }
          }
        }
      }
    }`

    var allMembers []EnterpriseUserAccount
    var cursor *string
    hasNextPage := true

    for hasNextPage {
        variables := map[string]interface{}{
            "enterpriseSlug": enterpriseSlug,
            "cursor":         cursor,
            "batchSize":      100,
        }

        resp, err := makeGraphQLRequest(token, query, variables)
        if err != nil {
            fmt.Printf("Request failed: %v\n", err)
            os.Exit(1)
        }
        defer resp.Body.Close()

        var result EnterpriseResponse
        if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
            fmt.Printf("Failed to decode response: %v\n", err)
            os.Exit(1)
        }

        allMembers = append(allMembers, result.Data.Enterprise.Members.Nodes...)
        hasNextPage = result.Data.Enterprise.Members.PageInfo.HasNextPage
        if hasNextPage {
            cursor = &result.Data.Enterprise.Members.PageInfo.EndCursor
        }

        fmt.Printf("Retrieved %d members so far...\n", len(allMembers))
        time.Sleep(200 * time.Millisecond)
    }

    fmt.Printf("Total members retrieved: %d\n", len(allMembers))
}
```

## Performance Optimization

### Query Optimization

1. **Field Selection:** Only request fields you need
2. **Nested Limits:** Limit nested queries (e.g., `organizations(first: 50)`)
3. **Avoid Deep Nesting:** Flatten complex relationships where possible

### Memory Management

```javascript
// Process in chunks to avoid memory issues with large datasets
const CHUNK_SIZE = 1000;
for (let i = 0; i < allUsers.length; i += CHUNK_SIZE) {
  const chunk = allUsers.slice(i, i + CHUNK_SIZE);
  const processedChunk = await processUserChunk(chunk);
  await writeChunkToCSV(processedChunk);
}
```

### Parallel Processing

```javascript
// Process multiple organizations in parallel (with rate limiting)
const semaphore = new Semaphore(5); // Max 5 concurrent requests

const enhancedUsers = await Promise.all(
  users.map(async (user) => {
    await semaphore.acquire();
    try {
      return await enhanceUserData(user);
    } finally {
      semaphore.release();
    }
  })
);
```

## Security Considerations

### Token Security

- Store tokens in environment variables, never in code
- Use tokens with minimal required scopes
- Rotate tokens regularly
- Consider using GitHub Apps for enterprise-wide access

### Data Privacy

- Handle email addresses and personal information appropriately
- Consider data retention policies for exported CSV files
- Be aware of GDPR/privacy regulations
- Log access and export activities for audit trails

### Error Information

- Don't expose sensitive information in error messages
- Log detailed errors securely, show generic errors to users
- Sanitize any data included in error reports

This technical documentation should provide everything needed to understand, modify, or reimplement the GitHub Enterprise user export functionality.
