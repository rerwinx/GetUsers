const { graphql } = require("@octokit/graphql");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ENTERPRISE_SLUG = process.env.ENTERPRISE_SLUG;
const OUTPUT_FILE = "enterprise-users-export.csv";
const BATCH_SIZE = 100; // GraphQL allows up to 100 nodes per request

if (!GITHUB_TOKEN || !ENTERPRISE_SLUG) {
  console.error(
    "❌ Error: Please set GITHUB_TOKEN and ENTERPRISE_SLUG in your .env file"
  );
  process.exit(1);
}

// Initialize GraphQL client
const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${GITHUB_TOKEN}`,
  },
});

// GraphQL query to get enterprise members
const GET_ENTERPRISE_MEMBERS = `
  query($enterpriseSlug: String!, $cursor: String, $batchSize: Int!) {
    enterprise(slug: $enterpriseSlug) {
      name
      description
      members(first: $batchSize, after: $cursor) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ... on EnterpriseUserAccount {
            login
            name
            user {
              login
              name
              email
              createdAt
              updatedAt
              isSiteAdmin
              # Get organization memberships
              organizations(first: 100) {
                nodes {
                  login
                  name
                }
                edges {
                  role
                  node {
                    login
                    name
                  }
                }
              }
              # Check if user has enterprise server accounts
              enterpriseInstallations(first: 10) {
                nodes {
                  hostname
                }
                edges {
                  role
                  node {
                    hostname
                  }
                }
              }
            }
            organizations(first: 100) {
              nodes {
                login
                name
                # Get SAML identity provider info if available
                samlIdentityProvider {
                  externalIdentities(login: $login, first: 1) {
                    nodes {
                      samlIdentity {
                        nameId
                      }
                      user {
                        login
                      }
                    }
                  }
                }
              }
              edges {
                role
                node {
                  login
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Main query to get enterprise members with basic information
const GET_ENTERPRISE_MEMBERS_SIMPLE = `
  query($enterpriseSlug: String!, $cursor: String, $batchSize: Int!) {
    enterprise(slug: $enterpriseSlug) {
      name
      description
      members(first: $batchSize, after: $cursor) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ... on EnterpriseUserAccount {
            login
            name
            createdAt
            updatedAt
            user {
              login
              name
              email
              createdAt
              updatedAt
              isSiteAdmin
            }
            organizations(first: 50) {
              totalCount
              edges {
                role
                node {
                  login
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Get additional user details for 2FA status and verified domain emails
const GET_ORGANIZATION_MEMBER_DETAILS = `
  query($login: String!, $orgLogin: String!) {
    organization(login: $orgLogin) {
      membersWithRole(query: $login, first: 1) {
        edges {
          hasTwoFactorEnabled
          node {
            login
          }
        }
      }
      samlIdentityProvider {
        externalIdentities(login: $login, first: 1) {
          nodes {
            samlIdentity {
              nameId
            }
          }
        }
      }
    }
  }
`;

// CSV column headers matching Enterprise Portal format
const csvHeaders = [
  { id: "login", title: "Username" },
  { id: "name", title: "Display Name" },
  { id: "email", title: "Email" },
  { id: "role", title: "Enterprise Role" },
  { id: "two_factor_enabled", title: "2FA Enabled" },
  { id: "two_factor_method_security", title: "2FA Method Security" },
  { id: "organizations", title: "Organizations" },
  { id: "organization_roles", title: "Organization Roles" },
  { id: "saml_name_id", title: "SAML NameID" },
  { id: "verified_domain_emails", title: "Verified Domain Emails" },
  { id: "enterprise_server_user_ids", title: "Enterprise Server User IDs" },
  { id: "created_at", title: "Created At" },
  { id: "updated_at", title: "Updated At" },
];

// Progress tracking
let processedUsers = 0;
let totalUsers = 0;

function logProgress() {
  const percentage =
    totalUsers > 0 ? Math.round((processedUsers / totalUsers) * 100) : 0;
  console.log(
    `📊 Progress: ${processedUsers}/${totalUsers} users (${percentage}%)`
  );
}

// Get detailed information for a user across organizations
async function getUserDetailsForOrgs(login, organizations) {
  const userDetails = {
    twoFactorEnabled: null,
    verifiedDomainEmails: [],
    samlNameId: null,
    organizationRoles: [],
  };

  // Try to get 2FA status from the first organization (most reliable)
  if (organizations.length > 0) {
    try {
      const orgLogin = organizations[0].login;

      const result = await graphqlWithAuth(GET_ORGANIZATION_MEMBER_DETAILS, {
        login: login,
        orgLogin: orgLogin,
      });

      if (result.organization?.membersWithRole?.edges?.[0]) {
        userDetails.twoFactorEnabled =
          result.organization.membersWithRole.edges[0].hasTwoFactorEnabled;
      }

      if (
        result.organization?.samlIdentityProvider?.externalIdentities
          ?.nodes?.[0]?.samlIdentity
      ) {
        userDetails.samlNameId =
          result.organization.samlIdentityProvider.externalIdentities.nodes[0].samlIdentity.nameId;
      }
    } catch (error) {
      // Don't log warnings for every user - just track that we couldn't get the data
      // console.warn(`⚠️  Could not get detailed info for user ${login}: ${error.message}`);
    }
  }

  return userDetails;
}

// Process and format user data
async function processUserData(enterpriseMembers, enterpriseName) {
  const users = [];

  console.log(`🔍 Processing ${enterpriseMembers.length} users...`);

  for (const member of enterpriseMembers) {
    try {
      const user = member.user || member;

      // Extract organization information
      const organizations = member.organizations?.edges || [];
      const orgNames = organizations.map((edge) => edge.node.login).join(";");
      const orgRoles = organizations
        .map((edge) => `${edge.node.login}:${edge.role}`)
        .join(";");

      // Get additional details
      const userDetails = await getUserDetailsForOrgs(
        user.login,
        organizations.map((edge) => edge.node)
      );

      // Format the user data
      const userData = {
        login: user.login,
        name: user.name || "",
        email: user.email || "",
        role: "MEMBER", // Default role - could be enhanced to detect enterprise owners
        two_factor_enabled:
          userDetails.twoFactorEnabled !== null
            ? userDetails.twoFactorEnabled
            : "N/A",
        two_factor_method_security:
          userDetails.twoFactorEnabled === true ? "SECURE" : "NOT_CONFIGURED",
        organizations: orgNames,
        organization_roles: orgRoles,
        saml_name_id: userDetails.samlNameId || "",
        verified_domain_emails: userDetails.verifiedDomainEmails.join(";"),
        enterprise_server_user_ids: "", // Would need separate query for Enterprise Server data
        created_at: user.createdAt || member.createdAt || "",
        updated_at: user.updatedAt || member.updatedAt || "",
      };

      users.push(userData);
      processedUsers++;

      // Log progress every 100 users
      if (processedUsers % 100 === 0) {
        logProgress();
      }

      // Add a small delay to avoid hitting rate limits too hard
      if (processedUsers % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(
        `❌ Error processing user ${
          member.login || member.user?.login || "unknown"
        }: ${error.message}`
      );
    }
  }

  return users;
}

// Main function to export users
async function exportEnterpriseUsers() {
  console.log(`🚀 Starting export for enterprise: ${ENTERPRISE_SLUG}`);

  try {
    let allUsers = [];
    let cursor = null;
    let hasNextPage = true;

    // First, get the total count
    console.log("📊 Getting total user count...");
    const initialQuery = await graphqlWithAuth(GET_ENTERPRISE_MEMBERS_SIMPLE, {
      enterpriseSlug: ENTERPRISE_SLUG,
      cursor: null,
      batchSize: 1,
    });

    totalUsers = initialQuery.enterprise.members.totalCount;
    console.log(
      `📈 Found ${totalUsers} total users in enterprise "${initialQuery.enterprise.name}"`
    );

    // Fetch all users with pagination
    while (hasNextPage) {
      console.log(
        `🔄 Fetching batch of ${BATCH_SIZE} users... ${
          cursor ? `(cursor: ${cursor.substring(0, 10)}...)` : "(first batch)"
        }`
      );

      const result = await graphqlWithAuth(GET_ENTERPRISE_MEMBERS_SIMPLE, {
        enterpriseSlug: ENTERPRISE_SLUG,
        cursor: cursor,
        batchSize: BATCH_SIZE,
      });

      const members = result.enterprise.members.nodes;
      console.log(`✅ Fetched ${members.length} users in this batch`);

      // Process the batch
      const processedBatch = await processUserData(
        members,
        result.enterprise.name
      );
      allUsers = allUsers.concat(processedBatch);

      // Update pagination
      hasNextPage = result.enterprise.members.pageInfo.hasNextPage;
      cursor = result.enterprise.members.pageInfo.endCursor;

      console.log(`📊 Processed ${allUsers.length}/${totalUsers} users so far`);
    }

    // Write to CSV
    console.log(`💾 Writing ${allUsers.length} users to ${OUTPUT_FILE}...`);

    const csvWriter = createCsvWriter({
      path: OUTPUT_FILE,
      header: csvHeaders,
    });

    await csvWriter.writeRecords(allUsers);

    console.log(`✅ Export completed successfully!`);
    console.log(`📄 File: ${path.resolve(OUTPUT_FILE)}`);
    console.log(`👥 Users exported: ${allUsers.length}`);
    console.log(
      `📊 File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(
        2
      )} MB`
    );
  } catch (error) {
    console.error("❌ Export failed:", error);

    if (error.message.includes("rate limit")) {
      console.log("⏰ Rate limit hit. Please wait and try again.");
    } else if (error.message.includes("not found")) {
      console.log(
        "🔍 Enterprise not found. Please check your ENTERPRISE_SLUG."
      );
    } else if (
      error.message.includes("unauthorized") ||
      error.message.includes("forbidden")
    ) {
      console.log(
        "🔐 Authorization error. Please check your GITHUB_TOKEN has the required scopes."
      );
    }

    process.exit(1);
  }
}

// Handle process interruption
process.on("SIGINT", () => {
  console.log("\n🛑 Export interrupted by user");
  process.exit(0);
});

// Run the export
exportEnterpriseUsers();
