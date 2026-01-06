# Setting Up CI/CD for an Existing S3 Static Website (From Zero to Automated)

I already had a static website hosted on Amazon S3.  
It worked fine, but there was one major problem:

Every change required me to manually upload files to S3.
I will change this to haviong only to push to github repos and from there github action will take over.
it push only required changes to S3. 

---

## Project Overview

The static website consisted of:
- index.html
- script.js
- style.css
- posts/
  -posts.json
  -post**.md
- README.md

it a simple html,css and js Project, although there are many framework performance optimisation for them is very tedious and complex for out requirements hence we will go with this vanilla setup as it does not require any performance optimisation unless you are attaching very heavy assets. 

index.html file has js script which renders all the posts in in posts folder by fetching it from json file in same folder. md to html parser is fetched from another cdn. 

Below is your content rewritten as a **clean, correct, single Markdown file**, with proper headings, lists, and fenced code blocks. You can copy-paste this directly into a `.md` file.

---

````md
## Step 1: Download the Existing Site from S3

Since the site already lived in S3, the first step was to pull it down locally:

```bash
aws s3 sync s3://my-bucket-name ./site
````

This ensured my local copy exactly matched what was live.

---

## Step 2: Initialize a Git Repository

Once the files were local:

```bash
git init
git add .
git commit -m "Initial commit of S3 static site"
```

Then I created a GitHub repository and pushed the code:

```bash
git branch -M main
git remote add origin https://github.com/username/repo.git
git push -u origin main
```

From this point forward, GitHub became the source of truth.

---

## Step 3: Create an IAM User for CI/CD

This step is critical.

CI/CD **cannot** use console login credentials.
It requires **programmatic access**.

I created a dedicated IAM user with:

* No console access
* Only S3 permissions
* Access limited to a single bucket

The policy attached looked like this:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-bucket-name",
        "arn:aws:s3:::my-bucket-name/*"
      ]
    }
  ]
}
```

I then generated:

* `AWS_ACCESS_KEY_ID`
* `AWS_SECRET_ACCESS_KEY`

---

## Step 4: Store Secrets in GitHub

In the GitHub repository settings, I added **repository secrets**:

* `AWS_ACCESS_KEY_ID`
* `AWS_SECRET_ACCESS_KEY`
* `AWS_REGION`
* `S3_BUCKET`

These secrets are securely injected into GitHub Actions at runtime.

---

## Step 5: Create the GitHub Actions Workflow

I added the following file:

```
.github/workflows/deploy.yml
```

```yaml
name: Deploy static site to S3

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Sync site to S3
        run: |
          aws s3 sync . s3://${{ secrets.S3_BUCKET }} \
            --delete \
            --exclude ".git/*" \
            --exclude ".github/*"
```

This workflow runs on every push to `main` and syncs the site to S3.

---

## Step 6: Push and Verify

Once the workflow was added:

```bash
git add .github/workflows/deploy.yml
git commit -m "Add CI/CD deployment workflow"
git push
```

The pipeline ran automatically, and the site updated without manual uploads.

---

## Some Questions I had while doing this and I answered them below

---

### “How will actions ignore .git and .github folder for pushing to bucket ?”

```yaml
  run: |
    aws s3 sync . s3://${{ secrets.S3_BUCKET }} \
      --delete \
      --exclude ".git/*" \
      --exclude ".github/*"
```

this part ensure there are ignored.

---

### “I only have a console sign-in URL, username, and password. Is that enough?”

No.

Console credentials are for **humans**, not automation.

CI/CD requires:

* `AWS_ACCESS_KEY_ID`
* `AWS_SECRET_ACCESS_KEY`

These are **programmatic credentials** created in IAM.

---

### “Is the S3 bucket tied to the IAM user?”

Not directly.

* S3 buckets belong to the **AWS account**
* IAM users get access **only through policies**

The bucket is “associated” with the user only because the policy explicitly allows it.

---

### “Should I use repository secrets or environment secrets?”

For this setup:

* One bucket
* One branch
* One environment

**Repository secrets** are the correct choice.

Environment secrets are useful later if you introduce `dev` / `prod` separation or approval gates.

---

###  “My site uses JavaScript and a posts folder. Will CI/CD break that?”

No.

GitHub Actions simply uploads files.
As long as:

* `posts/` is in the repository
* `script.js` references it correctly

Everything continues to work exactly as before.

---
