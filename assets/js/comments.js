let comments = [];
let activeCommentThreadId = null;

async function loadComments() {
  const { data, error } = await supabaseClient
    .from("thread_comments")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  comments = data || [];
}

function getThreadComments(threadId) {
  return comments.filter((comment) => comment.thread_id === threadId);
}

function getThreadCommentCount(threadId) {
  return getThreadComments(threadId).length;
}

function openCommentsModal(threadId) {
  activeCommentThreadId = threadId;

  const modalBackdrop = document.getElementById("commentsModalBackdrop");
  const commentsInput = document.getElementById("commentInput");

  if (!modalBackdrop) return;

  renderCommentsModalContent();

  modalBackdrop.classList.add("active");
  modalBackdrop.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  setTimeout(() => {
    if (commentsInput) commentsInput.focus();
  }, 180);
}

function closeCommentsModal() {
  const modalBackdrop = document.getElementById("commentsModalBackdrop");

  if (!modalBackdrop) return;

  activeCommentThreadId = null;

  modalBackdrop.classList.remove("active");
  modalBackdrop.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function renderCommentsModalContent() {
  const commentsList = document.getElementById("commentsList");
  const commentsTitle = document.getElementById("commentsModalTitle");

  if (!commentsList || !activeCommentThreadId) return;

  const thread = threads.find((item) => item.id === activeCommentThreadId);
  const threadComments = typeof filterBlockedComments === "function"
    ? filterBlockedComments(getThreadComments(activeCommentThreadId))
    : getThreadComments(activeCommentThreadId);

  if (commentsTitle) {
    commentsTitle.textContent = `Replies · ${threadComments.length}`;
  }

  if (!thread) {
    commentsList.innerHTML = `
      <div class="empty-state">
        <strong>Thread not found.</strong>
        Refresh and try again.
      </div>
    `;
    return;
  }

  const profile = getProfileByUserId(thread.user_id);

  const name =
    profile?.full_name ||
    thread.user_name ||
    "User";

  const avatar =
    profile?.avatar_url ||
    thread.user_avatar ||
    fallbackAvatar(name || "User");

  const username = profile?.username ? `@${profile.username}` : "@user";

  const originalThreadHTML = `
    <article class="comment-original-thread">
      <div class="thread-user">
        <img src="${escapeHTML(avatar)}" alt="${escapeHTML(name)} avatar" />
        <div>
          <strong>${escapeHTML(name)}</strong>
          <span>${escapeHTML(username)} · ${escapeHTML(formatDate(thread.created_at))}</span>
        </div>
      </div>

      <p>${escapeHTML(thread.content)}</p>
    </article>
  `;

  if (!threadComments.length) {
    commentsList.innerHTML = `
      ${originalThreadHTML}

      <div class="empty-state">
        <strong>No replies yet.</strong>
        Be the first to reply.
      </div>
    `;
    return;
  }

  const commentsHTML = threadComments
    .map((comment) => {
      const commentProfile = getProfileByUserId(comment.user_id);
      const isOwner = currentUser && comment.user_id === currentUser.id;

      const commentAvatar =
        commentProfile?.avatar_url ||
        fallbackAvatar(comment.user_id || "User");

      const commentName =
        commentProfile?.full_name ||
        "ThreadWave User";

      const commentUsername =
        commentProfile?.username
          ? `@${commentProfile.username}`
          : "user";

      return `
        <article class="comment-card">
          <div class="thread-user">
            <img src="${escapeHTML(commentAvatar)}" alt="${escapeHTML(commentName)} avatar" />
            <div>
              <strong>${escapeHTML(commentName)}</strong>
              <span>${escapeHTML(commentUsername)} · ${escapeHTML(formatDate(comment.created_at))}</span>
            </div>
          </div>

          <p>${escapeHTML(comment.content)}</p>

          ${
            isOwner
              ? `<button class="mini-action delete-action comment-delete-btn" data-comment-delete-id="${escapeHTML(comment.id)}">Delete</button>`
              : ""
          }
        </article>
      `;
    })
    .join("");

  commentsList.innerHTML = `
    ${originalThreadHTML}
    ${commentsHTML}
  `;

  bindCommentDeleteButtons();
}

function bindCommentDeleteButtons() {
  document.querySelectorAll("[data-comment-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const commentId = button.dataset.commentDeleteId;
      await deleteComment(commentId);
    });
  });
}

async function createComment() {
  const commentInput = document.getElementById("commentInput");
  const commentUploadBtn = document.getElementById("commentUploadBtn");

  if (!commentInput || !activeCommentThreadId) return;

  if (!currentUser) {
    setStatus("Sign in first to reply.", "error");
    signInWithGoogle();
    return;
  }

  const targetThread = Array.isArray(threads)
    ? threads.find((thread) => thread.id === activeCommentThreadId)
    : null;

  if (targetThread && typeof canInteractWithUser === "function" && !canInteractWithUser(targetThread.user_id)) {
    setStatus("You cannot reply to a blocked user.", "error");
    return;
  }

  const content = commentInput.value.trim();

  if (!content) {
    setStatus("Write a reply first.", "error");
    return;
  }

  if (content.length > 220) {
    setStatus("Keep replies under 220 characters.", "error");
    return;
  }

  if (commentUploadBtn) {
    commentUploadBtn.disabled = true;
    commentUploadBtn.textContent = "Uploading...";
  }

  const { data: createdComment, error } = await supabaseClient
    .from("thread_comments")
    .insert({
      thread_id: activeCommentThreadId,
      user_id: currentUser.id,
      content
    })
    .select("*")
    .single();

  if (commentUploadBtn) {
    commentUploadBtn.disabled = false;
    commentUploadBtn.textContent = "Upload";
  }

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  commentInput.value = "";
  updateCommentCharCount();

  if (typeof createCommentNotification === "function") {
    await createCommentNotification(activeCommentThreadId, createdComment?.id || null);
  }

  if (createdComment) {
    comments = [...comments, createdComment].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else {
    await loadComments();
  }

  setStatus("Reply uploaded 🚀", "success");

  renderCommentsModalContent();

  if (typeof renderThreads === "function") {
    renderThreads();
  }

  if (typeof renderProfilePosts === "function") {
    renderProfilePosts();
  }
}

async function deleteComment(commentId) {
  if (!currentUser) {
    setStatus("You need to be logged in.", "error");
    return;
  }

  const { error } = await supabaseClient
    .from("thread_comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", currentUser.id);

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  setStatus("Reply deleted.", "success");

  await loadComments();
  renderCommentsModalContent();
  renderThreads();
}

function updateCommentCharCount() {
  const commentInput = document.getElementById("commentInput");
  const commentCharCount = document.getElementById("commentCharCount");

  if (!commentInput || !commentCharCount) return;

  commentCharCount.textContent = `${commentInput.value.length} / 220`;
}

function renderCommentsModal() {
  return `
    <div id="commentsModalBackdrop" class="modal-backdrop" aria-hidden="true">
      <section class="thread-modal" role="dialog" aria-modal="true" aria-labelledby="commentsModalTitle">
        <div class="modal-head">
          <div>
            <h2 id="commentsModalTitle">Replies</h2>
            <p>Join the conversation. Keep it clean and sharp.</p>
          </div>

          <button id="commentsModalCloseBtn" class="modal-close" type="button" aria-label="Close comments modal">
            ×
          </button>
        </div>

        <div id="commentsList" class="comments-list"></div>

        <div class="comment-composer">
          <textarea
            id="commentInput"
            class="modal-textarea comment-textarea"
            maxlength="220"
            placeholder="Write a reply..."
          ></textarea>

          <div class="modal-footer">
            <span id="commentCharCount">0 / 220</span>
            <button id="commentUploadBtn" class="btn primary-btn" type="button">Upload</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function setupCommentsModal() {
  document.body.insertAdjacentHTML("beforeend", renderCommentsModal());

  const commentsModalBackdrop = document.getElementById("commentsModalBackdrop");
  const commentsModalCloseBtn = document.getElementById("commentsModalCloseBtn");
  const commentInput = document.getElementById("commentInput");
  const commentUploadBtn = document.getElementById("commentUploadBtn");

  if (commentsModalCloseBtn) {
    commentsModalCloseBtn.addEventListener("click", closeCommentsModal);
  }

  if (commentsModalBackdrop) {
    commentsModalBackdrop.addEventListener("click", (event) => {
      if (event.target === commentsModalBackdrop) {
        closeCommentsModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      commentsModalBackdrop &&
      commentsModalBackdrop.classList.contains("active")
    ) {
      closeCommentsModal();
    }
  });

  if (commentInput) {
    commentInput.addEventListener("input", updateCommentCharCount);
  }

  if (commentUploadBtn) {
    commentUploadBtn.addEventListener("click", createComment);
  }

  updateCommentCharCount();
}
