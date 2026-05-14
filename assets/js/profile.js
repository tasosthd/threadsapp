let profileThreads = [];
let profileLikes = [];
let profileData = null;
let pendingDeleteThreadId = null;

/* =========================
   HELPERS
========================= */

function getProfileFileExtension(file) {
  const nameParts = file.name.split(".");
  const extensionFromName = nameParts.length > 1 ? nameParts.pop().toLowerCase() : "";

  if (extensionFromName) {
    return extensionFromName;
  }

  const mimeMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };

  return mimeMap[file.type] || "jpg";
}

function getProfileThreadLikeCount(threadId) {
  return profileLikes.filter((like) => like.thread_id === threadId).length;
}

function getProfileTotalLikes() {
  return profileThreads.reduce((total, thread) => {
    return total + getProfileThreadLikeCount(thread.id);
  }, 0);
}

/* =========================
   PROFILE UI
========================= */

function renderProfileEditor() {
  const profileEditorAvatar = document.getElementById("profileEditorAvatar");
  const profileEditorName = document.getElementById("profileEditorName");
  const profileEditorEmail = document.getElementById("profileEditorEmail");
  const profileUsernameInput = document.getElementById("profileUsernameInput");
  const profileBioInput = document.getElementById("profileBioInput");

  if (!currentUser) return;

  const meta = getUserMeta(currentUser);

  const avatar =
    profileData?.avatar_url ||
    currentProfile?.avatar_url ||
    meta.avatar ||
    fallbackAvatar(meta.email || "User");

  const name =
    profileData?.full_name ||
    currentProfile?.full_name ||
    meta.name ||
    "ThreadWave User";

  const email =
    profileData?.email ||
    currentProfile?.email ||
    meta.email ||
    "";

  if (profileEditorAvatar) {
    profileEditorAvatar.src = avatar;
  }

  if (profileEditorName) {
    profileEditorName.textContent = name;
  }

  if (profileEditorEmail) {
    profileEditorEmail.textContent = email;
  }

  if (profileUsernameInput) {
    profileUsernameInput.value = profileData?.username || currentProfile?.username || "";
  }

  if (profileBioInput) {
    profileBioInput.value = profileData?.bio || currentProfile?.bio || "";
  }
}

function renderProfileStats() {
  const profilePostCount = document.getElementById("profilePostCount");
  const profileLikeCount = document.getElementById("profileLikeCount");

  if (profilePostCount) {
    profilePostCount.textContent = profileThreads.length;
  }

  if (profileLikeCount) {
    profileLikeCount.textContent = getProfileTotalLikes();
  }
}

function renderProfilePosts() {
  const profilePostsList = document.getElementById("profilePostsList");

  if (!profilePostsList) return;

  if (!currentUser) {
    profilePostsList.innerHTML = `
      <div class="empty-state">
        <strong>Sign in first.</strong>
        Login with Google to edit your profile and see your posts.
      </div>
    `;
    return;
  }

  if (!profileThreads.length) {
    profilePostsList.innerHTML = `
      <div class="empty-state">
        <strong>No posts yet.</strong>
        Your profile posts will appear here after you upload your first thread.
      </div>
    `;
    return;
  }

  profilePostsList.innerHTML = profileThreads
    .map((thread) => {
      const avatar =
        profileData?.avatar_url ||
        currentProfile?.avatar_url ||
        thread.user_avatar ||
        fallbackAvatar(thread.user_email || "User");

      const name =
        profileData?.full_name ||
        currentProfile?.full_name ||
        thread.user_name ||
        "ThreadWave User";

      const username =
        profileData?.username
          ? `@${profileData.username}`
          : currentProfile?.username
            ? `@${currentProfile.username}`
            : thread.user_email || "";

      const content = escapeHTML(thread.content || "");
      const date = formatDate(thread.created_at);
      const likeCount = getProfileThreadLikeCount(thread.id);

      const threadText = content
        ? `<p class="thread-content">${content}</p>`
        : "";

      const threadImage = thread.image_url
        ? `
          <div class="thread-image-wrap profile-thread-image-wrap">
            <img
              class="thread-image profile-thread-image"
              src="${escapeHTML(thread.image_url)}"
              alt="Thread image"
              loading="lazy"
            />
          </div>
        `
        : "";

      return `
        <article class="thread-card">
          <div class="thread-top">
            <div class="thread-user">
              <img src="${escapeHTML(avatar)}" alt="${escapeHTML(name)} avatar" />
              <div>
                <strong>${escapeHTML(name)}</strong>
                <span>${escapeHTML(username)} · ${escapeHTML(date)}</span>
              </div>
            </div>
          </div>

          ${threadText}
          ${threadImage}

          <div class="thread-actions profile-thread-actions">
            <div class="action-left social-actions">
              <button
                class="social-action-btn like-action"
                type="button"
                aria-label="Likes"
                disabled
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12.1 21.35 10.65 20.03C5.4 15.26 2 12.18 2 8.4 2 5.32 4.42 2.9 7.5 2.9c1.74 0 3.41.81 4.5 2.09C13.09 3.71 14.76 2.9 16.5 2.9 19.58 2.9 22 5.32 22 8.4c0 3.78-3.4 6.86-8.65 11.63l-1.25 1.32Z"></path>
                </svg>
                <span>${likeCount}</span>
              </button>
            </div>

            <button
              class="mini-action delete-action profile-delete-btn"
              type="button"
              data-profile-delete-id="${escapeHTML(thread.id)}"
            >
              Delete
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  bindProfileDeleteButtons();
}

/* =========================
   LOAD PROFILE DATA
========================= */

async function loadProfilePageData() {
  if (!currentUser) {
    profileData = null;
    profileThreads = [];
    profileLikes = [];

    renderProfileEditor();
    renderProfileStats();
    renderProfilePosts();

    return;
  }

  const profileRequest = supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  const threadsRequest = supabaseClient
    .from("threads")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  const likesRequest = supabaseClient
    .from("thread_likes")
    .select("*");

  const [profileResponse, threadsResponse, likesResponse] = await Promise.all([
    profileRequest,
    threadsRequest,
    likesRequest
  ]);

  if (profileResponse.error) {
    setStatus(profileResponse.error.message, "error");
    return;
  }

  if (threadsResponse.error) {
    setStatus(threadsResponse.error.message, "error");
    return;
  }

  if (likesResponse.error) {
    setStatus(likesResponse.error.message, "error");
    return;
  }

  profileData = profileResponse.data || null;
  currentProfile = profileData || currentProfile;

  profileThreads = threadsResponse.data || [];
  profileLikes = likesResponse.data || [];

  renderProfileEditor();
  renderProfileStats();
  renderProfilePosts();
  updateSharedAuthUI();

  setStatus("");
}

/* =========================
   SAVE PROFILE
========================= */

async function saveProfileFromProfilePage() {
  if (!currentUser) {
    setStatus("Sign in first.", "error");
    return;
  }

  const profileUsernameInput = document.getElementById("profileUsernameInput");
  const profileBioInput = document.getElementById("profileBioInput");
  const saveProfilePageBtn = document.getElementById("saveProfilePageBtn");
  const profileEditorAvatar = document.getElementById("profileEditorAvatar");

  const username = cleanUsername(profileUsernameInput?.value || "");
  const bio = String(profileBioInput?.value || "").trim().slice(0, 160);

  if (!username || username.length < 3) {
    setStatus("Username needs at least 3 characters.", "error");
    return;
  }

  if (saveProfilePageBtn) {
    saveProfilePageBtn.disabled = true;
    saveProfilePageBtn.textContent = "Saving...";
  }

  /*
    CEO FIX:
    Preserve custom uploaded avatar when saving username/bio.
    Never force Google avatar back here.
  */
  const currentAvatarUrl =
    profileData?.avatar_url ||
    currentProfile?.avatar_url ||
    (
      profileEditorAvatar?.src &&
      !profileEditorAvatar.src.startsWith("blob:")
        ? profileEditorAvatar.src
        : null
    );

  const updatePayload = {
    username,
    bio,
    updated_at: new Date().toISOString()
  };

  if (currentAvatarUrl) {
    updatePayload.avatar_url = currentAvatarUrl;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .update(updatePayload)
    .eq("id", currentUser.id)
    .select()
    .single();

  if (saveProfilePageBtn) {
    saveProfilePageBtn.disabled = false;
    saveProfilePageBtn.textContent = "Save profile";
  }

  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      setStatus("That username is already taken.", "error");
    } else {
      setStatus(error.message, "error");
    }

    return;
  }

  profileData = data;
  currentProfile = data;

  renderProfileEditor();
  renderProfilePosts();
  updateSharedAuthUI();

  setStatus("");
}

/* =========================
   PROFILE AVATAR UPLOAD
========================= */

async function uploadProfileAvatar(file) {
  if (!currentUser || !file) return null;

  const extension = getProfileFileExtension(file);

  /*
    Use one stable filename per user.
    upsert replaces it, ?v=Date.now() breaks browser cache.
  */
  const filePath = `${currentUser.id}/avatar.${extension}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("profile-avatars")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true
    });

  if (uploadError) {
    setStatus(uploadError.message, "error");
    return null;
  }

  const { data } = supabaseClient.storage
    .from("profile-avatars")
    .getPublicUrl(filePath);

  if (!data?.publicUrl) {
    setStatus("Could not get avatar URL.", "error");
    return null;
  }

  return `${data.publicUrl}?v=${Date.now()}`;
}

async function handleProfileAvatarChange(event) {
  if (!currentUser) {
    setStatus("Sign in first.", "error");
    event.target.value = "";
    return;
  }

  const file = event.target.files?.[0];

  if (!file) return;

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    setStatus("Please upload a JPG, PNG, or WEBP image.", "error");
    event.target.value = "";
    return;
  }

  const maxSizeInMB = 4;
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;

  if (file.size > maxSizeInBytes) {
    setStatus(`Profile picture must be under ${maxSizeInMB}MB.`, "error");
    event.target.value = "";
    return;
  }

  const profileEditorAvatar = document.getElementById("profileEditorAvatar");
  const localPreviewUrl = URL.createObjectURL(file);

  if (profileEditorAvatar) {
    profileEditorAvatar.src = localPreviewUrl;
  }

  setStatus("");

  const publicUrl = await uploadProfileAvatar(file);

  if (!publicUrl) {
    event.target.value = "";
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .update({
      avatar_url: publicUrl,
      updated_at: new Date().toISOString()
    })
    .eq("id", currentUser.id)
    .select()
    .single();

  event.target.value = "";

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  profileData = data;
  currentProfile = data;

  renderProfileEditor();
  renderProfilePosts();
  updateSharedAuthUI();

  setStatus("");
}

/* =========================
   DELETE THREAD MODAL
========================= */

function renderDeleteModal() {
  return `
    <div id="deletePostModalBackdrop" class="modal-backdrop" aria-hidden="true">
      <section class="delete-post-modal" role="dialog" aria-modal="true" aria-labelledby="deletePostModalTitle">
        <div class="delete-modal-icon">!</div>

        <div class="delete-modal-content">
          <h2 id="deletePostModalTitle">Delete post?</h2>
          <p>
            This action cannot be undone. Your thread will be permanently removed from your profile.
          </p>
        </div>

        <div class="delete-modal-actions">
          <button id="cancelDeletePostBtn" class="btn ghost-btn" type="button">
            Cancel
          </button>

          <button id="confirmDeletePostBtn" class="btn danger-btn" type="button">
            Delete
          </button>
        </div>
      </section>
    </div>
  `;
}

function openDeletePostModal(threadId) {
  pendingDeleteThreadId = threadId;

  const deletePostModalBackdrop = document.getElementById("deletePostModalBackdrop");

  if (!deletePostModalBackdrop) return;

  deletePostModalBackdrop.classList.add("active");
  deletePostModalBackdrop.setAttribute("aria-hidden", "false");

  document.body.style.overflow = "hidden";
}

function closeDeletePostModal() {
  pendingDeleteThreadId = null;

  const deletePostModalBackdrop = document.getElementById("deletePostModalBackdrop");

  if (!deletePostModalBackdrop) return;

  deletePostModalBackdrop.classList.remove("active");
  deletePostModalBackdrop.setAttribute("aria-hidden", "true");

  document.body.style.overflow = "";
}

function setupDeleteModal() {
  if (!document.getElementById("deletePostModalBackdrop")) {
    document.body.insertAdjacentHTML("beforeend", renderDeleteModal());
  }

  const deletePostModalBackdrop = document.getElementById("deletePostModalBackdrop");
  const cancelDeletePostBtn = document.getElementById("cancelDeletePostBtn");
  const confirmDeletePostBtn = document.getElementById("confirmDeletePostBtn");

  if (cancelDeletePostBtn) {
    cancelDeletePostBtn.addEventListener("click", closeDeletePostModal);
  }

  if (deletePostModalBackdrop) {
    deletePostModalBackdrop.addEventListener("click", (event) => {
      if (event.target === deletePostModalBackdrop) {
        closeDeletePostModal();
      }
    });
  }

  if (confirmDeletePostBtn) {
    confirmDeletePostBtn.addEventListener("click", async () => {
      if (!pendingDeleteThreadId) return;

      confirmDeletePostBtn.disabled = true;
      confirmDeletePostBtn.textContent = "Deleting...";

      await deleteProfileThread(pendingDeleteThreadId);

      confirmDeletePostBtn.disabled = false;
      confirmDeletePostBtn.textContent = "Delete";

      closeDeletePostModal();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDeletePostModal();
    }
  });
}

function bindProfileDeleteButtons() {
  document.querySelectorAll("[data-profile-delete-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openDeletePostModal(button.dataset.profileDeleteId);
    });
  });
}

async function deleteProfileThread(threadId) {
  if (!currentUser) {
    setStatus("You need to be logged in.", "error");
    return;
  }

  const { error } = await supabaseClient
    .from("threads")
    .delete()
    .eq("id", threadId)
    .eq("user_id", currentUser.id);

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  setStatus("");
  await loadProfilePageData();
}

/* =========================
   SETUP
========================= */

function setupProfilePageButtons() {
  const saveProfilePageBtn = document.getElementById("saveProfilePageBtn");
  const goHomeBtn = document.getElementById("goHomeBtn");
  const profileAvatarInput = document.getElementById("profileAvatarInput");

  if (saveProfilePageBtn) {
    saveProfilePageBtn.addEventListener("click", saveProfileFromProfilePage);
  }

  if (goHomeBtn) {
    goHomeBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  if (profileAvatarInput) {
    profileAvatarInput.addEventListener("change", handleProfileAvatarChange);
  }
}

async function initProfilePage() {
  setupAuthButtons();
  setupProfilePageButtons();

  mountSharedUI({
    includeModal: true
  });

  setupDeleteModal();

  setBottomNavActive("profile");

  await restoreSession();
  await loadProfilePageData();

  listenForAuthChanges({
    onSignedIn: async () => {
      await loadProfilePageData();
    },
    onSignedOut: async () => {
      profileData = null;
      profileThreads = [];
      profileLikes = [];

      renderProfileEditor();
      renderProfileStats();
      renderProfilePosts();

      setBottomNavActive("profile");
    }
  });
}