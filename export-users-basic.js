const { graphql } = require("@octokit/graphql");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ENTERPRISE_SLUG = process.env.ENTERPRISE_SLUG;
const OUTPUT_FILE = "enterprise-users-export-basic.csv";
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

// Basic query to get enterprise members - no 2FA or SAML data
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
            createdAt
            updatedAt
            user {
              login
              name
              email
              createdAt
              updatedAt
              isSiteAdmin
              company
              location
              websiteUrl
              twitterUsername
            }
            organizations(first: 50) {
              totalCount
              edges {
                role
                node {
                  login
                  name
                  description
                  email
                  websiteUrl
                  location
                  createdAt
                }
              }
            }
          }
        }
      }
    }
  }
`;

// CSV column headers for basic export
const csvHeaders = [
  { id: "login", title: "Username" },
  { id: "name", title: "Display Name" },
  { id: "email", title: "Email" },
  { id: "company", title: "Company" },
  { id: "location", title: "Location" },
  { id: "website_url", title: "Website" },
  { id: "twitter_username", title: "Twitter" },
  { id: "is_site_admin", title: "Site Admin" },
  { id: "organizations_count", title: "Organizations Count" },
  { id: "organizations", title: "Organizations" },
  { id: "organization_roles", title: "Organization Roles" },
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

// Process and format user data
function processUserData(enterpriseMembers) {
  const users = [];

  for (const member of enterpriseMembers) {
    try {
      const user = member.user || member;

      // Extract organization information
      const organizations = member.organizations?.edges || [];
      const orgNames = organizations.map((edge) => edge.node.login).join("; ");
      const orgRoles = organizations
        .map((edge) => `${edge.node.login}: ${edge.role}`)
        .join("; ");

      // Format the user data
      const userData = {
        login: user.login || member.login || "",
        name: user.name || member.name || "",
        email: user.email || "",
        company: user.company || "",
        location: user.location || "",
        website_url: user.websiteUrl || "",
        twitter_username: user.twitterUsername || "",
        is_site_admin: user.isSiteAdmin || false,
        organizations_count: organizations.length,
        organizations: orgNames,
        organization_roles: orgRoles,
        created_at: user.createdAt || member.createdAt || "",
        updated_at: user.updatedAt || member.updatedAt || "",
      };

      users.push(userData);
      processedUsers++;

      // Log progress every 100 users
      if (processedUsers % 100 === 0) {
        logProgress();
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
  console.log(`🚀 Starting basic export for enterprise: ${ENTERPRISE_SLUG}`);

  try {
    let allUsers = [];
    let cursor = null;
    let hasNextPage = true;

    // First, get the total count
    console.log("📊 Getting total user count...");
    const initialQuery = await graphqlWithAuth(GET_ENTERPRISE_MEMBERS, {
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
      console.log(`🔄 Fetching batch of ${BATCH_SIZE} users...`);

      const result = await graphqlWithAuth(GET_ENTERPRISE_MEMBERS, {
        enterpriseSlug: ENTERPRISE_SLUG,
        cursor: cursor,
        batchSize: BATCH_SIZE,
      });

      const members = result.enterprise.members.nodes;
      console.log(`✅ Fetched ${members.length} users in this batch`);

      // Process the batch
      const processedBatch = processUserData(members);
      allUsers = allUsers.concat(processedBatch);

      // Update pagination
      hasNextPage = result.enterprise.members.pageInfo.hasNextPage;
      cursor = result.enterprise.members.pageInfo.endCursor;

      logProgress();

      // Add a small delay to be respectful of rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
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

    // Show sample of first few users
    if (allUsers.length > 0) {
      console.log(`\n📋 Sample data (first user):`);
      console.log(`   Username: ${allUsers[0].login}`);
      console.log(`   Name: ${allUsers[0].name}`);
      console.log(`   Organizations: ${allUsers[0].organizations_count}`);
    }
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
        "🔐 Authorization error. Please check your GITHUB_TOKEN has the required scopes (read:enterprise, read:org, read:user)."
      );
    }

    process.exit(1);
  }
}

// Handle process interruption
process.on("SIGINT", () => {
  console.log("\n🛑 Export interrupted by user");
  if (processedUsers > 0) {
    console.log(`📊 Processed ${processedUsers} users before interruption`);
  }
  process.exit(0);
});

// Run the export
console.log("🎯 GitHub Enterprise Users Export - Basic Version");
console.log(
  "   This version exports basic user information without 2FA/SAML details"
);
console.log(
  "   Use export-users.js for the full version with enhanced security info\n"
);

exportEnterpriseUsers();
