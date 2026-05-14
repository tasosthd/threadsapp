let profileThreads = [];
let profileLikes = [];

function updateProfileEditorUI() {
  const profileEditorAvatar = document.getElementById("profileEditorAvatar");
  const profileEditorName = document.getElementById("profileEditorName");
  const profileEditorEmail = document.getElementById("profileEditorEmail");
  const profileUsernameInput = document.getElementById("profileUsernameInput");
  const profileBioInput = document.getElementById("profileBioInput");

  if (!currentUser || !currentProfile) {
    return;
  }

  const meta = getUserMeta(currentUser);

  if (profileEditorAvatar) {
    profileEditorAvatar.src = currentProfile.avatar_url || meta.avatar;
  }

  if (profileEditorName) {
    profileEditorName.textContent = currentProfile.full_name || meta.name || "ThreadWave User";
  }

  if (profileEditorEmail) {
    profileEditorEmail.textContent = currentProfile.email || meta.email || "";
  }

  if (profileUsernameInput) {
    profileUsernameInput.value = currentProfile.username || "";
  }

  if (profileBioInput) {
    profileBioInput.value = currentProfile.bio || "";
  }
}

async function loadProfileStats() {
  if (!currentUser) return;

  const threadsResponse = await supabaseClient
    .from("threads")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (threadsResponse.error) {
    setStatus(threadsResponse.error.message, "error");
    return;
  }

  profileThreads = threadsResponse.data || [];

  const likesResponse = await supabaseClient
    .from("thread_likes")
    .select("*");

  if (likesResponse.error) {
    setStatus(likesResponse.error.message, "error");
    return;
  }

  profileLikes = likesResponse.data || [];

  renderProfileStats();
  renderProfileRecentPosts();
}

function renderProfileStats() {
  const profilePostCount = document.getElementById("profilePostCount");
  const profileLikeCount = document.getElementById("profileLikeCount");

  const totalLikes = profileThreads.reduce((total, thread) => {
    const threadLikes = profileLikes.filter((like) => like.thread_id === thread.id).length;
    return total + threadLikes;
  }, 0);

  if (profilePostCount) {
    profilePostCount.textContent = profileThreads.length;
  }

  if (profileLikeCount) {
    profileLikeCount.textContent = totalLikes;
  }
}

function renderProfileRecentPosts() {
  const profilePostsList = document.getElementById("profilePostsList");
  if (!profilePostsList) return;

  if (!profileThreads.length) {
    profilePostsList.innerHTML = `
      <div class="empty-state">
        <strong>No posts yet.</strong>
        Hit the plus button and upload your first thread.
      </div>
    `;
    return;
  }

  profilePostsList.innerHTML = profileThreads
    .slice(0, 12)
    .map((thread) => {
      const date = formatDate(thread.created_at);
      const content = escapeHTML(thread.content || "");

      const threadText = content
        ? `<p class="thread-content">${content}</p>`
        : "";

      const threadImage = thread.image_url
        ? `
          <div class="thread-image-wrap profile-thread-image-wrap">
            <img
              class="thread-image profile-thread-image"
              src="${escapeHTML(thread.image_url)}"
              alt="Profile thread image"
              loading="lazy"
            />
          </div>
        `
        : "";

      return `
        <article class="thread-card">
          <div class="thread-top">
            <div class="thread-user">
              <img src="${escapeHTML(currentProfile?.avatar_url || fallbackAvatar(currentProfile?.email || "User"))}" alt="Profile avatar" />
              <div>
                <strong>${escapeHTML(currentProfile?.full_name || "ThreadWave User")}</strong>
                <span>@${escapeHTML(currentProfile?.username || "username")} · ${escapeHTML(date)}</span>
              </div>
            </div>
          </div>

          ${threadText}
          ${threadImage}
        </article>
      `;
    })
    .join("");
}

async function saveProfilePage() {
  if (!currentUser) {
    setStatus("Sign in first.", "error");
    signInWithGoogle();
    return;
  }

  const profileUsernameInput = document.getElementById("profileUsernameInput");
  const profileBioInput = document.getElementById("profileBioInput");
  const saveProfilePageBtn = document.getElementById("saveProfilePageBtn");

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

  const { data, error } = await supabaseClient
    .from("profiles")
    .update({
      username,
      bio,
      updated_at: new Date().toISOString()
    })
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

  currentProfile = data;

  updateSharedAuthUI();
  updateProfileEditorUI();

  setStatus("Profile saved 🚀", "success");

  await loadProfileStats();
}

function setupProfileButtons() {
  const saveProfilePageBtn = document.getElementById("saveProfilePageBtn");
  const goHomeBtn = document.getElementById("goHomeBtn");

  if (saveProfilePageBtn) {
    saveProfilePageBtn.addEventListener("click", saveProfilePage);
  }

  if (goHomeBtn) {
    goHomeBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }
}

async function initProfilePage() {
  setupAuthButtons();
  setupProfileButtons();
  mountSharedUI({ includeModal: false });
  setBottomNavActive("profile");

  await restoreSession();

  if (!currentUser) {
    setStatus("Sign in to edit your profile.", "error");
    return;
  }

  updateProfileEditorUI();
  await loadProfileStats();

  listenForAuthChanges({
    onSignedIn: async () => {
      updateProfileEditorUI();
      await loadProfileStats();
    },
    onSignedOut: async () => {
      window.location.href = "index.html";
    }
  });
}
