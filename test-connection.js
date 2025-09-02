const { graphql } = require("@octokit/graphql");
require("dotenv").config();

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ENTERPRISE_SLUG = process.env.ENTERPRISE_SLUG;

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

// Test basic enterprise access
async function testEnterpriseAccess() {
  console.log("🔍 Testing enterprise access...");

  try {
    const result = await graphqlWithAuth(
      `
      query($enterpriseSlug: String!) {
        enterprise(slug: $enterpriseSlug) {
          name
          description
          slug
          members {
            totalCount
          }
        }
      }
    `,
      { enterpriseSlug: ENTERPRISE_SLUG }
    );

    console.log("✅ Enterprise access successful!");
    console.log(`   Name: ${result.enterprise.name}`);
    console.log(`   Slug: ${result.enterprise.slug}`);
    console.log(`   Total Members: ${result.enterprise.members.totalCount}`);
    console.log(`   Description: ${result.enterprise.description || "N/A"}`);

    return true;
  } catch (error) {
    console.error("❌ Enterprise access failed:", error.message);
    return false;
  }
}

// Test fetching a small sample of users
async function testUserSample() {
  console.log("\n🔍 Testing user data retrieval...");

  try {
    const result = await graphqlWithAuth(
      `
      query($enterpriseSlug: String!) {
        enterprise(slug: $enterpriseSlug) {
          members(first: 3) {
            nodes {
              ... on EnterpriseUserAccount {
                login
                name
                createdAt
                user {
                  login
                  name
                  email
                  company
                  location
                }
                organizations(first: 5) {
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
    `,
      { enterpriseSlug: ENTERPRISE_SLUG }
    );

    const users = result.enterprise.members.nodes;
    console.log(
      `✅ User data retrieval successful! Got ${users.length} sample users`
    );

    users.forEach((user, index) => {
      console.log(`   User ${index + 1}:`);
      console.log(`     Login: ${user.login}`);
      console.log(`     Name: ${user.name || "N/A"}`);
      console.log(`     Email: ${user.user?.email || "N/A"}`);
      console.log(`     Organizations: ${user.organizations.totalCount}`);
      if (user.organizations.edges.length > 0) {
        const orgList = user.organizations.edges
          .map((edge) => `${edge.node.login} (${edge.role})`)
          .join(", ");
        console.log(`     Org Details: ${orgList}`);
      }
    });

    return true;
  } catch (error) {
    console.error("❌ User data retrieval failed:", error.message);
    return false;
  }
}

// Test rate limit status
async function testRateLimit() {
  console.log("\n🔍 Checking rate limit status...");

  try {
    const result = await graphqlWithAuth(`
      query {
        rateLimit {
          limit
          remaining
          resetAt
        }
      }
    `);

    console.log("✅ Rate limit check successful!");
    console.log(`   Limit: ${result.rateLimit.limit} requests per hour`);
    console.log(`   Remaining: ${result.rateLimit.remaining} requests`);
    console.log(
      `   Reset At: ${new Date(result.rateLimit.resetAt).toLocaleString()}`
    );

    if (result.rateLimit.remaining < 100) {
      console.log(
        "⚠️  Warning: Low rate limit remaining. Consider waiting before running the full export."
      );
    }

    return true;
  } catch (error) {
    console.error("❌ Rate limit check failed:", error.message);
    return false;
  }
}

// Test permissions for advanced features
async function testAdvancedPermissions() {
  console.log("\n🔍 Testing advanced permissions (2FA, SAML data)...");

  try {
    // Get first organization and user to test permissions
    const enterpriseResult = await graphqlWithAuth(
      `
      query($enterpriseSlug: String!) {
        enterprise(slug: $enterpriseSlug) {
          members(first: 1) {
            nodes {
              ... on EnterpriseUserAccount {
                login
                organizations(first: 1) {
                  edges {
                    node {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
      { enterpriseSlug: ENTERPRISE_SLUG }
    );

    const user = enterpriseResult.enterprise.members.nodes[0];
    if (!user || !user.organizations.edges[0]) {
      console.log("⚠️  No users or organizations found to test permissions");
      return false;
    }

    const userLogin = user.login;
    const orgLogin = user.organizations.edges[0].node.login;

    // Test 2FA and SAML data access
    const result = await graphqlWithAuth(
      `
      query($login: String!, $orgLogin: String!) {
        organization(login: $orgLogin) {
          login
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
    `,
      { login: userLogin, orgLogin: orgLogin }
    );

    console.log("✅ Advanced permissions test successful!");

    const member = result.organization.membersWithRole.edges[0];
    if (member) {
      console.log(
        `   2FA Status Available: ${
          member.hasTwoFactorEnabled !== null ? "Yes" : "No"
        }`
      );
      if (member.hasTwoFactorEnabled !== null) {
        console.log(`   2FA Enabled: ${member.hasTwoFactorEnabled}`);
      }
    }

    const samlProvider = result.organization.samlIdentityProvider;
    if (samlProvider) {
      console.log(`   SAML Provider: Available`);
      if (samlProvider.externalIdentities.nodes.length > 0) {
        console.log(`   SAML NameID: Available`);
      }
    } else {
      console.log(`   SAML Provider: Not configured`);
    }

    return true;
  } catch (error) {
    console.error("❌ Advanced permissions test failed:", error.message);
    console.log("   This is expected if you don't have org admin permissions");
    console.log(
      "   The basic export will still work without these permissions"
    );
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log("🧪 GitHub Enterprise API Test Suite");
  console.log("=====================================");

  const results = {
    enterprise: false,
    users: false,
    rateLimit: false,
    advanced: false,
  };

  results.enterprise = await testEnterpriseAccess();

  if (results.enterprise) {
    results.users = await testUserSample();
    results.rateLimit = await testRateLimit();
    results.advanced = await testAdvancedPermissions();
  }

  console.log("\n📊 Test Results Summary:");
  console.log("=======================");
  console.log(
    `Enterprise Access: ${results.enterprise ? "✅ PASS" : "❌ FAIL"}`
  );
  console.log(`User Data Retrieval: ${results.users ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Rate Limit Check: ${results.rateLimit ? "✅ PASS" : "❌ FAIL"}`);
  console.log(
    `Advanced Permissions: ${results.advanced ? "✅ PASS" : "⚠️  LIMITED"}`
  );

  if (results.enterprise && results.users) {
    console.log("\n🎉 Ready to run the export!");
    console.log("   Use: npm run basic (for basic export)");
    if (results.advanced) {
      console.log("   Use: npm start (for full export with 2FA/SAML data)");
    } else {
      console.log(
        "   Use: npm start (will fallback to basic data if permissions limited)"
      );
    }
  } else {
    console.log("\n❌ Tests failed. Please check your configuration:");
    console.log("   1. Verify GITHUB_TOKEN is correct and has required scopes");
    console.log("   2. Verify ENTERPRISE_SLUG matches your enterprise");
    console.log("   3. Ensure you have enterprise read permissions");
  }
}

runTests().catch(console.error);
