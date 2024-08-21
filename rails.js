const axios = require('axios');
const fs = require('fs');
const { plot } = require('nodeplotlib');

// Function to fetch issues from GitHub API
async function fetchIssues() {
  const issues = [];
  let page = 1;

  while (issues.length < 500) {
    const response = await axios.get(`https://api.github.com/repos/rails/rails/issues`, {
      params: {
        per_page: 100,
        page,
      },
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    issues.push(...response.data);
    page++;
  }

  return issues.slice(0, 500);
}

// Function to fetch pull requests from GitHub API
async function fetchPullRequests() {
  const pullRequests = [];
  let page = 1;

  while (pullRequests.length < 500) {
    const response = await axios.get(`https://api.github.com/repos/rails/rails/pulls`, {
      params: {
        per_page: 100,
        page,
      },
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    pullRequests.push(...response.data);
    page++;
  }

  return pullRequests.slice(0, 500);
}

// Analyze and visualize the issues data
function analyzeData(issues) {
  const issuesByDate = {};
  const issuesByUser = {};
  const labelsCount = {};
  const closingTimes = [];

  issues.forEach(issue => {
    const createdAt = new Date(issue.created_at).toISOString().split('T')[0];
    issuesByDate[createdAt] = (issuesByDate[createdAt] || 0) + 1;

    issuesByUser[issue.user.login] = (issuesByUser[issue.user.login] || 0) + 1;

    issue.labels.forEach(label => {
      labelsCount[label.name] = (labelsCount[label.name] || 0) + 1;
    });

    if (issue.closed_at) {
      const closedAt = new Date(issue.closed_at);
      const openedAt = new Date(issue.created_at);
      const timeToClose = (closedAt - openedAt) / (1000 * 60 * 60 * 24); // time in days
      closingTimes.push(timeToClose);
    }
  });

  // Visualization: Issues over time
  plot([
    {
      x: Object.keys(issuesByDate),
      y: Object.values(issuesByDate),
      type: 'bar',
      name: 'Issues Over Time'
    }
  ], {
    title: 'Number of Issues Over Time',
    xaxis: { title: 'Date' },
    yaxis: { title: 'Number of Issues' }
  });

  // Visualization: Issues by user
  plot([
    {
      x: Object.keys(issuesByUser),
      y: Object.values(issuesByUser),
      type: 'bar',
      name: 'Issues by User'
    }
  ], {
    title: 'Issues Reported by Users',
    xaxis: { title: 'User' },
    yaxis: { title: 'Number of Issues' }
  });

  // Visualization: Labels count
  plot([
    {
      x: Object.keys(labelsCount),
      y: Object.values(labelsCount),
      type: 'bar',
      name: 'Labels Count'
    }
  ], {
    title: 'Issues per Label',
    xaxis: { title: 'Label' },
    yaxis: { title: 'Number of Issues' }
  });

  // Average time to close an issue
  const avgTimeToClose = closingTimes.reduce((a, b) => a + b, 0) / closingTimes.length;
  console.log(`Average time to close an issue: ${avgTimeToClose.toFixed(2)} days`);
}

// Analyze labels with most pull requests
async function analyzeLabelsWithMostPRs(issues, pullRequests) {
  // Create a map to hold issue URLs and their labels
  const issueLabelsMap = new Map();
  
  issues.forEach(issue => {
    if (issue.labels) {
      const labels = issue.labels.map(label => label.name);
      issueLabelsMap.set(issue.url, labels);
    }
  });

  // Create a map to count pull requests per label
  const labelPRCounts = {};

  pullRequests.forEach(pr => {
    const issueUrl = pr.issue_url;
    if (issueLabelsMap.has(issueUrl)) {
      const labels = issueLabelsMap.get(issueUrl);
      labels.forEach(label => {
        if (labelPRCounts[label]) {
          labelPRCounts[label]++;
        } else {
          labelPRCounts[label] = 1;
        }
      });
    }
  });

  // Convert the labelPRCounts map to an array of objects and sort by count
  const sortedLabelPRs = Object.keys(labelPRCounts).map(label => ({
    label,
    count: labelPRCounts[label]
  })).sort((a, b) => b.count - a.count);

  console.log("Labels with the most pull requests:", sortedLabelPRs);

  // Optionally plot the results
  plot([
    {
      x: sortedLabelPRs.map(item => item.label),
      y: sortedLabelPRs.map(item => item.count),
      type: 'bar',
      name: 'Pull Requests by Label'
    }
  ], {
    title: 'Pull Requests per Label',
    xaxis: { title: 'Label' },
    yaxis: { title: 'Number of Pull Requests' }
  });
}

// Classify issues using HuggingFace
async function classifyIssues(issues) {
  const model = "distilbert-base-uncased"; // Example model

  for (const issue of issues) {
    const response = await axios.post(`https://api-inference.huggingface.co/models/${model}`, {
      inputs: issue.body
    }, {
      headers: {
        Authorization: `Bearer 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`
      }
    });

    issue.predicted_label = response.data[0].label;
  }

  return issues;
}

// Main execution
(async function() {
  try {
    const issues = await fetchIssues();
    const pullRequests = await fetchPullRequests();

    analyzeData(issues);
    await analyzeLabelsWithMostPRs(issues, pullRequests); // Analyze labels with the most pull requests
    const classifiedIssues = await classifyIssues(issues);
    fs.writeFileSync('classified_issues.json', JSON.stringify(classifiedIssues, null, 2));

  } catch (error) {
    console.error("Error:", error);
  }
})();
