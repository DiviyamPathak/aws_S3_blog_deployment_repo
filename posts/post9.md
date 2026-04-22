# Building a Serverless Network Latency Tracker with AWS, Terraform, and GitHub Actions

We are building a small production-style serverless system called **Network Latency Tracker**. The purpose of the system is simple: we register endpoint URLs, check them every few minutes, store latency history, and expose an API to read the results.

The useful part of this project is not only the application. We also learn how AWS serverless pieces fit together, how Terraform organizes infrastructure, how GitHub Actions can validate infrastructure changes, why we avoid storing AWS keys in GitHub, and how to keep a project like this low-cost.

## What We Are Building

The system has two main flows.

The first flow is user-driven:

```text
Client -> API Gateway HTTP API -> Lambda -> DynamoDB
```

We call `POST /register` with a URL. API Gateway receives the request and invokes the `register_endpoint` Lambda. The Lambda validates the URL and stores it in the `endpoints` DynamoDB table.

The second flow is scheduled:

```text
EventBridge schedule -> Lambda -> DynamoDB
```

Every five minutes, EventBridge invokes the `ping_endpoints` Lambda. That Lambda reads all registered URLs from DynamoDB, sends HTTP requests, measures latency, records success or failure, and stores the result in the `latency` DynamoDB table.

The query flow is:

```text
Client -> API Gateway HTTP API -> Lambda -> DynamoDB
```

We call `GET /results?url=<url>`. API Gateway invokes the `get_results` Lambda. The Lambda queries latency history from DynamoDB and returns both the raw history and uptime percentage.

## Why We Use These AWS Services

We use **API Gateway HTTP API** because we need a public HTTPS API without running our own servers. HTTP API is usually cheaper and simpler than API Gateway REST API for this kind of workload.

We use **AWS Lambda** because our workload is event-driven. The code only runs when someone calls the API or when the schedule fires. There are no always-on servers to maintain.

We use **DynamoDB** because the data model is simple, request volume can be small or spiky, and `PAY_PER_REQUEST` billing lets us avoid paying for provisioned capacity.

We use **EventBridge** because we need a reliable scheduler. It triggers the latency collector every five minutes.

We use **CloudWatch Logs** because Lambda and API Gateway need somewhere to write logs for debugging and operations.

We use **IAM roles and policies** because every Lambda needs permission to access only the AWS resources it actually uses.

## The Terraform Project Structure

The infrastructure is organized like this:

```text
infra
├── main.tf
├── variables.tf
├── outputs.tf
├── versions.tf
├── modules
│   ├── api_gateway
│   ├── dynamodb
│   ├── lambda
│   └── scheduler
└── environments
    ├── dev
    └── prod
```

We keep reusable infrastructure in `infra/modules`. Each module owns one responsibility:

- `dynamodb` creates the `endpoints` and `latency` tables.
- `lambda` packages Lambda code, creates the Lambda function, creates the execution role, attaches permissions, and creates the CloudWatch log group.
- `api_gateway` creates the HTTP API, routes, Lambda integrations, access logs, and invoke permissions.
- `scheduler` creates the EventBridge rule, EventBridge target, and Lambda permission for scheduled execution.

The root stack in `infra/main.tf` wires the modules together.

## Terraform Tutorial: Reading This Infrastructure

Terraform is an Infrastructure as Code tool. Instead of creating Lambda functions, DynamoDB tables, API Gateway routes, and EventBridge rules by clicking through the AWS console, we describe the desired infrastructure in `.tf` files.

Terraform then compares three things:

```text
Terraform code -> Terraform state -> real AWS resources
```

The code says what we want. The state file records what Terraform currently manages. AWS contains the real resources. When we run `terraform plan`, Terraform compares all three and shows what it wants to create, update, or destroy.

In this project, Terraform is responsible for the infrastructure only. The Lambda application code lives separately, but Terraform packages it and connects it to AWS.

### Step 1: Configure the AWS Provider

Terraform talks to AWS through the AWS provider.

A simplified provider setup looks like this:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
```

The provider does not contain AWS access keys. Locally, Terraform gets credentials from the AWS CLI profile we configured with `aws configure`. In GitHub Actions, Terraform gets temporary credentials through OIDC.

### Step 2: Use Variables for Environment Differences

Variables let the same Terraform code work for both dev and prod.

Example variables:

```hcl
variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}
```

Dev can pass:

```hcl
environment = "dev"
```

Prod can pass:

```hcl
environment = "prod"
```

Then resource names can include both values:

```hcl
name = "${var.project_name}-${var.environment}-endpoints"
```

That gives us predictable names such as:

```text
network-latency-tracker-dev-endpoints
network-latency-tracker-prod-endpoints
```

### Step 3: Build Small Modules

A Terraform module is a reusable folder of Terraform code. We use modules so each part of the system has one clear job.

For example, the DynamoDB module owns the tables. The Lambda module owns Lambda functions and IAM permissions. The API Gateway module owns routes and integrations.

A simplified module call looks like this:

```hcl
module "dynamodb" {
  source       = "./modules/dynamodb"
  project_name = var.project_name
  environment  = var.environment
}
```

The root stack calls the modules and passes values into them. The modules return outputs, and the root stack passes those outputs to other modules.

That is how the system gets connected. For example:

```text
DynamoDB module output -> Lambda environment variable
Lambda module output   -> API Gateway integration
Lambda module output   -> EventBridge target
```

This is one of the most important Terraform ideas: modules should not be isolated islands. They are small building blocks wired together through inputs and outputs.

### Step 4: Create AWS Resources

Inside a module, Terraform resources map to actual AWS resources.

A simplified DynamoDB table resource looks like this:

```hcl
resource "aws_dynamodb_table" "endpoints" {
  name         = "${var.project_name}-${var.environment}-endpoints"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "url"

  attribute {
    name = "url"
    type = "S"
  }
}
```

The resource type is `aws_dynamodb_table`. The local Terraform name is `endpoints`. Together, Terraform identifies it as:

```text
aws_dynamodb_table.endpoints
```

For Lambda, the resource type is usually:

```text
aws_lambda_function
```

For API Gateway HTTP API, we use resources such as:

```text
aws_apigatewayv2_api
aws_apigatewayv2_route
aws_apigatewayv2_integration
```

For the five-minute schedule, we use EventBridge resources such as:

```text
aws_cloudwatch_event_rule
aws_cloudwatch_event_target
```

Terraform uses references between resources to understand order. If API Gateway needs a Lambda function ARN, Terraform knows the Lambda must exist before API Gateway can finish connecting the integration.

### Step 5: Expose Important Values with Outputs

Outputs print useful values after `terraform apply`.

For this project, the most useful output is the API endpoint:

```hcl
output "api_endpoint" {
  value = module.api_gateway.api_endpoint
}
```

After deployment, we can read it with:

```bash
terraform -chdir=infra/environments/dev output -raw api_endpoint
```

That gives us the base URL we use for:

```text
POST /register
GET /results
```

### Step 6: Follow the Terraform Workflow

The normal Terraform workflow for this project is:

```text
fmt -> init -> validate -> plan -> apply -> test -> destroy
```

`terraform fmt` cleans up formatting.

`terraform init` downloads the provider and prepares the working directory.

`terraform validate` checks whether the Terraform configuration is valid.

`terraform plan` shows what Terraform wants to change.

`terraform apply` creates or updates AWS resources.

`terraform destroy` removes the resources when we are done testing.

We should treat `plan` as the review step. If the plan says Terraform wants to delete a production DynamoDB table, we stop and understand why before applying.

### Step 7: Make a Small Change Safely

Suppose we want the latency checker to run every ten minutes instead of every five minutes.

The scheduler module may receive a value like:

```hcl
schedule_expression = "rate(5 minutes)"
```

We change it to:

```hcl
schedule_expression = "rate(10 minutes)"
```

Then we run:

```bash
terraform -chdir=infra fmt -recursive
terraform -chdir=infra/environments/dev validate
terraform -chdir=infra/environments/dev plan
```

The plan should show an update to the EventBridge schedule, not a full rebuild of the whole project.

If the plan looks correct, we apply:

```bash
terraform -chdir=infra/environments/dev apply
```

This is the habit we want: small code change, review the plan, apply only when the plan matches our intention.

### Step 8: Respect Terraform State

Terraform state is important because it maps Terraform resources to real AWS resource IDs.

For example, the code may say:

```text
aws_lambda_function.ping_endpoints
```

The state knows the real AWS Lambda function name and ID behind that Terraform resource.

For local learning, Terraform may create local state files. We do not commit those files to GitHub. For team or production usage, we should move state to a remote backend such as S3 with state locking.

In this project, the safe rule is simple:

```text
Commit Terraform code.
Do not commit Terraform state.
```

This keeps the repository safe to publish and prevents environment-specific infrastructure metadata from leaking into source control.

The environment folders, `infra/environments/dev` and `infra/environments/prod`, call the same root stack with different settings. This lets us deploy the same architecture with different names and safety defaults.

## Dev and Prod Environments

The `dev` environment creates resources with names like:

```text
network-latency-tracker-dev-api
network-latency-tracker-dev-endpoints
network-latency-tracker-dev-latency
```

We use dev for testing. It has shorter log retention and DynamoDB deletion protection disabled, so it is easier to destroy.

The `prod` environment creates resources with names like:

```text
network-latency-tracker-prod-api
network-latency-tracker-prod-endpoints
network-latency-tracker-prod-latency
```

We use prod for real usage. It has longer log retention and DynamoDB deletion protection enabled. That means `terraform destroy` may fail in prod until we intentionally disable deletion protection.

For learning and testing, we should use `dev` first.

## DynamoDB Data Model

The `endpoints` table stores registered URLs:

```text
Partition key: url
Attributes: created_at
```

The `latency` table stores check results:

```text
Partition key: id
Attributes: url, latency_ms, status, timestamp, status_code, error
```

The required primary key for the latency table is `id`, but our query API needs to fetch history by URL. To support that efficiently, we add a DynamoDB global secondary index:

```text
Index name: url-timestamp-index
Partition key: url
Sort key: timestamp
```

This gives us both a unique ID for every latency record and a fast way to query history for one URL.

## What URLs Get Checked

The system checks only URLs that we register through:

```http
POST /register
```

If we never register a URL, the scheduled Lambda has nothing to check.

Example valid URLs:

```text
https://example.com
https://google.com
https://api.github.com
```

The code rejects unsafe local targets such as:

```text
localhost
127.0.0.1
private IP addresses
.local domains
URLs with username/password credentials
```

This matters because a public API that accepts arbitrary URLs can accidentally become a way to reach private networks. We reduce that risk by validating at registration time and again before the scheduled collector sends requests.

## Lambda Functions

We use three Lambda functions.

`register_endpoint` handles `POST /register`. It parses the JSON body, validates the URL, normalizes it, and writes it to the `endpoints` table.

`ping_endpoints` runs every five minutes. It scans the `endpoints` table, checks each URL, measures latency in milliseconds, records success or failure, and writes records to the `latency` table.

`get_results` handles `GET /results?url=<url>`. It validates the URL query parameter, queries the DynamoDB GSI, returns latency history, and calculates uptime percentage.

The Lambda code uses environment variables for table names and settings. We do not hardcode AWS credentials or table names in source code.

## Cost Behavior

This project can incur AWS cost, but it is designed to stay small and Free Tier friendly.

We avoid expensive always-on services:

```text
No NAT Gateway
No Application Load Balancer
No EKS
No EC2 fleet
No always-running servers
```

The main usage-based costs are:

- API Gateway HTTP API requests
- Lambda invocations and runtime duration
- DynamoDB reads, writes, and storage
- CloudWatch log ingestion and retained logs
- EventBridge scheduled invocations

DynamoDB uses:

```hcl
billing_mode = "PAY_PER_REQUEST"
```

That means we pay for actual reads and writes instead of paying for provisioned capacity.

The scheduled collector writes one latency record per URL every five minutes. That means:

```text
1 URL   = 288 writes per day
10 URLs = 2,880 writes per day
100 URLs = 28,800 writes per day
```

For a small dev test with a few URLs, cost should usually be tiny, often within Free Tier if the account still has Free Tier allowance. It is still real AWS usage, so we should destroy dev resources when we are finished testing.

## Choosing a Region

For low-cost testing, we use:

```text
us-east-1
```

This is the default region in the Terraform environment variables and in the GitHub Actions workflow.

If we want another region, we can override it when running Terraform:

```bash
terraform -chdir=infra/environments/dev plan -var='aws_region=ap-south-1'
terraform -chdir=infra/environments/dev apply -var='aws_region=ap-south-1'
```

For this project, keeping `us-east-1` is simple and cost-friendly.

## Local AWS Credentials

For local Terraform runs, we use the AWS CLI configuration on our own machine.

We configure it with:

```bash
aws configure
```

This asks for:

```text
AWS Access Key ID
AWS Secret Access Key
Default region name
Default output format
```

We can use:

```text
Default region name: us-east-1
Default output format: json
```

Then we verify the credentials:

```bash
aws sts get-caller-identity
```

If this returns our account ID and ARN, local AWS authentication is working.

Terraform automatically uses these local AWS credentials when we run commands from our terminal.

## Creating an Access Key for Local Use

We should not create access keys for the AWS root user.

For a learning or dev account, we can create an IAM user for local Terraform:

```text
IAM -> Users -> Create user
```

Example user name:

```text
network-latency-tracker-terraform-dev
```

For a personal sandbox, the simplest temporary permission is:

```text
AdministratorAccess
```

This is broad, but Terraform needs to create IAM roles, Lambda functions, DynamoDB tables, API Gateway resources, EventBridge rules, and CloudWatch log groups. In production, we would use a narrower deployment policy.

After creating the user, we go to:

```text
Security credentials -> Access keys -> Create access key
```

Then we configure our terminal:

```bash
aws configure
```

We keep these keys only on our machine. We do not commit them to GitHub, and we do not paste them into workflow files.

## Running Terraform Locally

From the repo root:

```bash
cd /home/helmhotz/projects2/cloud/infra/network-conn-tracker
```

We format Terraform:

```bash
terraform -chdir=infra fmt -recursive
```

We initialize dev:

```bash
terraform -chdir=infra/environments/dev init
```

We validate:

```bash
terraform -chdir=infra/environments/dev validate
```

We review the plan:

```bash
terraform -chdir=infra/environments/dev plan
```

We deploy:

```bash
terraform -chdir=infra/environments/dev apply
```

Terraform will show the resources it wants to create. We type:

```text
yes
```

only after reviewing the plan.

## Testing the API

After apply, we get the API endpoint:

```bash
API_ENDPOINT="$(terraform -chdir=infra/environments/dev output -raw api_endpoint)"
```

We register a URL:

```bash
curl -sS -X POST "$API_ENDPOINT/register" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

The scheduled collector runs every five minutes. After it has run, we query results:

```bash
curl -sS "$API_ENDPOINT/results?url=https%3A%2F%2Fexample.com&limit=50"
```

The response includes:

```text
latency history
uptime percentage
success/failure status
timestamps
```

## Destroying AWS Resources

When we finish testing, we should destroy dev:

```bash
terraform -chdir=infra/environments/dev destroy
```

Terraform will ask for confirmation. We type:

```text
yes
```

This removes the Lambda functions, API Gateway, DynamoDB tables, EventBridge rule, CloudWatch log groups, and IAM resources managed by Terraform.

If we deployed prod, we destroy prod with:

```bash
terraform -chdir=infra/environments/prod destroy
```

Prod has DynamoDB deletion protection enabled. If destroy fails because of deletion protection, we first change prod to:

```hcl
deletion_protection_enabled = false
```

Then we apply that change:

```bash
terraform -chdir=infra/environments/prod apply
```

Then we destroy:

```bash
terraform -chdir=infra/environments/prod destroy
```

## Publishing the Repo Publicly

It is okay to publish this repo publicly if we do not commit secrets or generated state.

We should never commit:

```text
AWS access keys
Terraform state files
Terraform plan files
Generated Lambda zip packages
.terraform directories
Local credentials
```

The `.gitignore` already covers important generated files such as:

```text
.terraform/
*.tfstate
*.tfstate.*
*.tfplan
*.zip
```

Before pushing, we check:

```bash
git status --short --untracked-files=all
```

We should not see files like:

```text
terraform.tfstate
terraform.tfstate.backup
*.zip
```

The Terraform lock file is safe to commit:

```text
.terraform.lock.hcl
```

It helps keep provider versions consistent.

## Why GitHub Actions Exists

In this project, GitHub Actions is a safety gate, not an automatic deployer.

The workflow runs:

```text
terraform fmt
terraform init -backend=false
terraform validate
terraform plan
```

It does not run:

```text
terraform apply
```

That means pushing to `main` does not create AWS resources.

This is intentional. The original requirement was to create a CI/CD pipeline that runs fmt, validate, and plan, but does not auto-apply without approval.

The value of this workflow is that every push or pull request checks:

- Terraform formatting
- Terraform syntax
- whether Terraform can initialize
- whether AWS authentication works
- what infrastructure changes Terraform would make

Then we can decide when to run `terraform apply` manually.

## Why GitHub Uses OIDC Instead of Access Keys

Our local machine uses credentials from:

```bash
aws configure
```

GitHub Actions runs on a temporary GitHub-hosted runner. That runner does not have our local AWS config.

We could store AWS access keys in GitHub secrets, but that creates long-lived credentials in another system. A safer approach is GitHub OIDC.

With OIDC, the flow is:

```text
GitHub Actions -> GitHub OIDC token -> AWS IAM role -> temporary AWS credentials -> Terraform plan
```

The workflow gets short-lived credentials only for that run. We do not store AWS access keys in GitHub.

## Creating the GitHub OIDC Provider in AWS

We create the OIDC provider in AWS IAM:

```text
IAM -> Identity providers -> Add provider
```

Values:

```text
Provider type: OpenID Connect
Provider URL: https://token.actions.githubusercontent.com
Audience: sts.amazonaws.com
```

IAM is global, so we do not need to think about region for this part.

We only need one GitHub OIDC provider per AWS account. Multiple repos can use it through different IAM roles and trust policies.

## Creating the GitHub Actions IAM Role

After the OIDC provider exists, we create an IAM role:

```text
IAM -> Roles -> Create role
```

Trusted entity:

```text
Web identity
```

Identity provider:

```text
token.actions.githubusercontent.com
```

Audience:

```text
sts.amazonaws.com
```

GitHub organization is the owner part of the repo URL.

For:

```text
https://github.com/alice/network-latency-tracker
```

we use:

```text
GitHub organization: alice
GitHub repository: network-latency-tracker
GitHub branch: main
```

That creates a trust relationship similar to:

```text
repo:alice/network-latency-tracker:ref:refs/heads/main
```

This means only workflows from that repo and branch can assume the role.

For learning, we may attach:

```text
AdministratorAccess
```

For real production, we should replace it with a narrower Terraform deployment policy.

After creating the role, we copy its ARN:

```text
arn:aws:iam::<account-id>:role/<role-name>
```

## Adding the GitHub Secret

In GitHub:

```text
Repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

We add:

```text
Name: AWS_ROLE_TO_ASSUME
Value: arn:aws:iam::<account-id>:role/<role-name>
```

This value is not an access key. It is only the ARN of the role GitHub is allowed to assume.

The workflow uses it here:

```yaml
role-to-assume: ${{ secrets.AWS_ROLE_TO_ASSUME }}
```

## Triggering GitHub Actions

The workflow runs on pushes to `main` when files under these paths change:

```text
infra/**
src/**
.github/workflows/terraform.yml
```

A README-only commit will not trigger the workflow because the workflow path filters do not include README files.

We can trigger it by committing a Terraform or workflow change:

```bash
git add .
git commit -m "Update Terraform configuration"
git push origin main
```

If a previous run failed, we can rerun it from the GitHub UI:

```text
GitHub repo -> Actions -> terraform -> failed run -> Re-run all jobs
```

If we want a manual button, we can add:

```yaml
workflow_dispatch:
```

to the workflow `on:` block.

## Terraform Formatting in CI

GitHub Actions runs:

```bash
terraform -chdir=infra fmt -check -recursive
```

This command fails if Terraform files are not formatted exactly as Terraform expects.

If the workflow reports a file like:

```text
environments/dev/main.tf
```

we run locally:

```bash
terraform -chdir=infra fmt -recursive
```

Then we commit the formatting change:

```bash
git add infra
git commit -m "Fix Terraform formatting"
git push origin main
```

We also split formatting into its own workflow job so formatting runs once before the dev/prod matrix jobs.

## Destroying GitHub-Side Access

The GitHub workflow does not create AWS resources because it does not run `terraform apply`.

If we want to remove the GitHub-to-AWS connection, we delete the GitHub secret:

```text
Repo -> Settings -> Secrets and variables -> Actions -> AWS_ROLE_TO_ASSUME -> Delete
```

Then in AWS, we can delete the IAM role used by GitHub Actions:

```text
IAM -> Roles -> <github-actions-role> -> Delete
```

We can also delete the OIDC provider:

```text
IAM -> Identity providers -> token.actions.githubusercontent.com -> Delete
```

We should only delete the OIDC provider if no other GitHub workflows in the AWS account use it.

## Useful Command Reference

Check AWS identity:

```bash
aws sts get-caller-identity
```

Format Terraform:

```bash
terraform -chdir=infra fmt -recursive
```

Initialize dev:

```bash
terraform -chdir=infra/environments/dev init
```

Validate dev:

```bash
terraform -chdir=infra/environments/dev validate
```

Plan dev:

```bash
terraform -chdir=infra/environments/dev plan
```

Apply dev:

```bash
terraform -chdir=infra/environments/dev apply
```

Destroy dev:

```bash
terraform -chdir=infra/environments/dev destroy
```

Get API endpoint:

```bash
terraform -chdir=infra/environments/dev output -raw api_endpoint
```

Register a URL:

```bash
API_ENDPOINT="$(terraform -chdir=infra/environments/dev output -raw api_endpoint)"

curl -sS -X POST "$API_ENDPOINT/register" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Query results:

```bash
curl -sS "$API_ENDPOINT/results?url=https%3A%2F%2Fexample.com&limit=50"
```

Check Git status before pushing:

```bash
git status --short --untracked-files=all
```

Push changes:

```bash
git add .
git commit -m "Update network latency tracker"
git push origin main
```

## Operational Notes We Keep in Mind

We use local `aws configure` credentials only on our machine.

We use GitHub OIDC for GitHub Actions because it avoids long-lived AWS keys in GitHub.

We keep `terraform apply` manual because infrastructure changes should be reviewed before creation.

We destroy dev when we are done testing because scheduled checks can continue to create DynamoDB writes and CloudWatch logs.

We commit Terraform code, Lambda source code, README files, examples, workflows, and provider lock files.

We do not commit Terraform state, generated zip files, AWS credentials, or local environment files.
