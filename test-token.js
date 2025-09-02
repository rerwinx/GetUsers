const { graphql } = require("@octokit/graphql");
require("dotenv").config();

// Simple token validation test
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

    console.log("✅ GitHub Token is valid!");
    console.log(`   Authenticated as: ${result.viewer.login}`);
    console.log(`   Name: ${result.viewer.name || "Not set"}`);
    return true;
  } catch (error) {
    console.error("❌ GitHub Token failed:", error.message);
    return false;
  }
}

// Quick test - run this file directly
if (require.main === module) {
  console.log("🧪 Quick Token Test");
  console.log("==================");
  testToken();
}

module.exports = { testToken };
