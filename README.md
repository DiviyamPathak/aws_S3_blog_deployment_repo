## To add post 
1. Place inside posts directory
2. add the file to posts.json 

## Deployment
This is blog is hosted on AWS S3 bucket.
Local changes are made inside git Repo which is pushed to 
Remote repo i.e. Github. Actions which is defined in YAML file
named deploy.yml inside .github/workflows, pushed the code from
remote repo to s3 bucket after removing file which are not needed.
