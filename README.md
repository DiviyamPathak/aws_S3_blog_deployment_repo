## Adding a New Post

To add a new blog post:

1. Place the post file inside the `posts/` directory.
2. Add the corresponding entry to `posts.json`.

This ensures the post is indexed and rendered by the blog.

---

## Deployment

This blog is hosted on an **AWS S3 bucket**.

Deployment workflow:

1. Local changes are made in the **Git repository**.
2. Changes are pushed to the **remote repository (GitHub)**.
3. A **GitHub Actions workflow** defined in:.github/workflows/deploy.yml is triggered on push.
4. The workflow:
   - Builds/prepares the site
   - Removes unnecessary files
   - Uploads the required files to the **AWS S3 bucket**

---

## Live Website

The blog is served through **Amazon CloudFront**.

**URL:**  
[https://d2q19wqrjjfgl.cloudfront.net/](https://d2q19wqrjjfgl.cloudfront.net/)
