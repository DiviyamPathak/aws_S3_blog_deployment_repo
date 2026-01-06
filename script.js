document.addEventListener("DOMContentLoaded", () => {
  const postContent = document.getElementById("post-content");
  const postListPage = document.getElementById("post-list-page");
  const postPage = document.getElementById("post-page");
  const backBtn = document.getElementById("back-btn");
  const backBtn1 = document.getElementById("back-btn-1");
  const postListEl = document.getElementById("post-list"); // container for links

  if (window.location.protocol === "file:") {
    postContent.innerHTML = `
      <div style="color: red; text-align: center;">
        ⚠️ Please run this site using a local server.<br>
        Try <code>python3 -m http.server 8000</code> and visit 
        <a href="http://localhost:8000" style="color: inherit;">http://localhost:8000</a>
      </div>
    `;
    return;
  }

  // Fetch list of posts from posts.json
  fetch("posts/posts.json")
    .then(res => res.json())
    .then(files => {
      const ul = document.createElement("ul");

      files.forEach(async file => {
        try {
          const res = await fetch(`posts/${file}`);
          const mdText = await res.text();
          const headingMatch = mdText.match(/^#\s+(.*)/m); // first H1 as title
          const title = headingMatch ? headingMatch[1] : file;

          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = "#";
          a.textContent = title;
          a.dataset.post = file;

          a.addEventListener("click", async e => {
            e.preventDefault();
            await loadPost(file);
          });

          li.appendChild(a);
          ul.appendChild(li);
        } catch (err) {
          console.error(`Failed to load ${file}:`, err);
        }
      });

      postListEl.appendChild(ul);
    })
    .catch(err => {
      postListEl.innerHTML = `<p style="color:red;">❌ Failed to load posts.json: ${err}</p>`;
    });

  // Back to list
  backBtn.addEventListener("click", () => {
    postPage.classList.add("hidden");
    postListPage.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  backBtn1.addEventListener("click", () => {
    postPage.classList.add("hidden");
    postListPage.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  async function loadPost(filename) {
    postContent.innerHTML = `<p>Loading <b>${filename}</b>...</p>`;
    try {
      const res = await fetch(`posts/${filename}`);
      if (!res.ok) throw new Error("Post not found");
      const mdText = await res.text();

      marked.setOptions({
        breaks: true,
        headerIds: true,
        mangle: false
      });

      const html = marked.parse(mdText);
      postContent.innerHTML = html;

      postListPage.classList.add("hidden");
      postPage.classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      postContent.innerHTML = `<p style="color:red;">❌ ${err.message}</p>`;
    }
  }
});
