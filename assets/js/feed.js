let threads = [];
let likes = [];
let profiles = [];
let activeFilter = "all";
let viewedProfileId = null;
let realtimeChannel = null;
let appStarted = false;

function getProfileByUserId(userId) {
  return profiles.find((profile) => profile.id === userId) || null;
}

function getThreadLikes(threadId) {
  return likes.filter((like) => like.thread_id === threadId);
}

function getThreadLikeCount(threadId) {
  return getThreadLikes(threadId).length;
}

function getUserTotalLikes(userId) {
  const userThreads = threads.filter((thread) => thread.user_id === userId);

  return userThreads.reduce((total, thread) => {
    return total + getThreadLikeCount(thread.id);
  }, 0);
}

function userLikedThread(threadId) {
  if (!currentUser) return false;

  return likes.some((like) => {
    return like.thread_id === threadId && like.user_id === currentUser.id;
  });
}

function getFileExtension(file) {
  const nameParts = file.name.split(".");
  const extensionFromName = nameParts.length > 1 ? nameParts.pop().toLowerCase() : "";

  if (extensionFromName) {
    return extensionFromName;
  }

  const mimeMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };

  return mimeMap[file.type] || "jpg";
}

async function uploadThreadImage(file) {
  if (!currentUser || !file) return null;

  const extension = getFileExtension(file);
  const safeTimestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2, 10);
  const filePath = `${currentUser.id}/${safeTimestamp}-${randomId}.${extension}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("thread-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (uploadError) {
    setStatus(uploadError.message, "error");
    return null;
  }

  const { data } = supabaseClient.storage
    .from("thread-images")
    .getPublicUrl(filePath);

  return data?.publicUrl || null;
}

async function loadFeed() {
  const threadsRequest = supabaseClient
    .from("threads")
    .select("*")
    .order("created_at", { ascending: false });

  const likesRequest = supabaseClient
    .from("thread_likes")
    .select("*");

  const profilesRequest = supabaseClient
    .from("profiles")
    .select("id, full_name, username, avatar_url, bio, created_at, updated_at");

  const [threadsResponse, likesResponse, profilesResponse] = await Promise.all([
    threadsRequest,
    likesRequest,
    profilesRequest
  ]);

  if (threadsResponse.error) {
    setStatus(threadsResponse.error.message, "error");
    return;
  }

  if (likesResponse.error) {
    setStatus(likesResponse.error.message, "error");
    return;
  }

  if (profilesResponse.error) {
    setStatus(profilesResponse.error.message, "error");
    return;
  }

  threads = threadsResponse.data || [];
  likes = likesResponse.data || [];
  profiles = profilesResponse.data || [];

  if (typeof loadComments === "function") {
    await loadComments();
  }

  if (typeof loadModerationData === "function") {
    await loadModerationData();
  }

  if (typeof loadFollows === "function") {
    await loadFollows();
  }

  if (currentUser) {
    currentProfile = getProfileByUserId(currentUser.id) || currentProfile;
    updateSharedAuthUI();
  }

  updatePublicProfileUI();
  renderFeedStats();
  renderThreads();

  if (typeof renderUserSearchResults === "function") {
    renderUserSearchResults();
  }

  const statusText = document.getElementById("statusMsg")?.textContent || "";

  if (
    !statusText.includes("posted") &&
    !statusText.includes("uploaded") &&
    !statusText.includes("Uploading") &&
    !statusText.includes("Image") &&
    !statusText.includes("Liked") &&
    !statusText.includes("removed") &&
    !statusText.includes("deleted") &&
    !statusText.includes("saved") &&
    !statusText.includes("restored") &&
    !statusText.includes("Followed") &&
    !statusText.includes("Unfollowed")
  ) {
    setStatus("");
  }
}

function renderFeedStats() {
  const totalThreads = document.getElementById("totalThreads");
  const myThreads = document.getElementById("myThreads");

  const visibleCountThreads = typeof filterBlockedThreads === "function"
    ? filterBlockedThreads(threads)
    : threads;

  if (totalThreads) {
    totalThreads.textContent = visibleCountThreads.length;
  }

  if (myThreads) {
    const ownCount = currentUser
      ? threads.filter((thread) => thread.user_id === currentUser.id).length
      : 0;

    myThreads.textContent = ownCount;
  }
}

function getVisibleThreads() {
  const safeThreads = typeof filterBlockedThreads === "function"
    ? filterBlockedThreads(threads)
    : threads;

  if (viewedProfileId) {
    if (typeof isModerationHiddenUser === "function" && isModerationHiddenUser(viewedProfileId)) {
      return [];
    }

    return safeThreads.filter((thread) => thread.user_id === viewedProfileId);
  }

  if (activeFilter === "mine" && currentUser) {
    return safeThreads.filter((thread) => thread.user_id === currentUser.id);
  }

  if (activeFilter === "following" && currentUser) {
    if (typeof getFollowingIdsForCurrentUser !== "function") {
      return [];
    }

    const followingIds = getFollowingIdsForCurrentUser();

    return safeThreads.filter((thread) => followingIds.includes(thread.user_id));
  }

  return safeThreads;
}

function renderThreads() {
  const threadsList = document.getElementById("threadsList");
  if (!threadsList) return;

  const visibleThreads = getVisibleThreads();

  if (!visibleThreads.length) {
    const message = viewedProfileId
      ? typeof t === "function" ? t("thisProfileNoPosts") : "This profile has not posted yet."
      : activeFilter === "mine"
        ? typeof t === "function" ? t("youNoPosts") : "You have not posted yet. Drop your first founder thought."
        : activeFilter === "following"
          ? typeof t === "function" ? t("followingNoPosts") : "No posts from people you follow yet. Follow some creators first."
          : typeof t === "function" ? t("firstPost") : "Be the first founder to post something powerful.";

    threadsList.innerHTML = `
      <div class="empty-state">
        <strong>${typeof t === "function" ? t("noThreadsYet") : "No threads yet."}</strong>
        ${message}
      </div>
    `;
    return;
  }

  threadsList.innerHTML = visibleThreads
    .map((thread) => {
      const isOwner = currentUser && thread.user_id === currentUser.id;
      const likedByUser = userLikedThread(thread.id);
      const likeCount = getThreadLikeCount(thread.id);

      const commentCount =
        typeof getThreadCommentCount === "function"
          ? getThreadCommentCount(thread.id)
          : 0;

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

      const content = escapeHTML(thread.content || "");
      const date = formatDate(thread.created_at);

      const canFollowUser = currentUser && thread.user_id !== currentUser.id && (typeof canInteractWithUser !== "function" || canInteractWithUser(thread.user_id));

      const alreadyFollowing =
        typeof isFollowingUser === "function"
          ? isFollowingUser(thread.user_id)
          : false;

      const feedFollowButton = canFollowUser
        ? `
          <button
            class="mini-action feed-follow-btn ${alreadyFollowing ? "following" : ""}"
            type="button"
            data-follow-user-id="${escapeHTML(thread.user_id)}"
          >
            ${alreadyFollowing ? (typeof t === "function" ? t("following") : "Following") : (typeof t === "function" ? t("follow") : "Follow")}
          </button>
        `
        : "";

      const threadImage = thread.image_url
        ? `
          <div class="thread-image-wrap">
            <img
              class="thread-image"
              src="${escapeHTML(thread.image_url)}"
              alt="Thread image"
              loading="lazy"
            />
          </div>
        `
        : "";

      const threadText = content
        ? `<p class="thread-content">${content}</p>`
        : "";

      const deleteButton = isOwner
        ? `
          <button
            class="mini-action delete-action"
            data-delete-id="${escapeHTML(thread.id)}"
            type="button"
          >
            ${typeof t === "function" ? t("delete") : "Delete"}
          </button>
        `
        : "";

      const moderationActions = currentUser && !isOwner
        ? `
          <button
            class="mini-action moderation-action"
            data-report-post-id="${escapeHTML(thread.id)}"
            data-report-user-id="${escapeHTML(thread.user_id)}"
            type="button"
          >
            Report Post
          </button>

          <button
            class="mini-action moderation-action danger-soft"
            data-block-user-id="${escapeHTML(thread.user_id)}"
            type="button"
          >
            Block User
          </button>
        `
        : "";

      return `
        <article class="thread-card">
          <div class="thread-top">
            <button class="thread-user" data-profile-id="${escapeHTML(thread.user_id)}" type="button">
              <img src="${escapeHTML(avatar)}" alt="${escapeHTML(name)} avatar" />
              <div>
                <strong>${escapeHTML(name)}</strong>
                <span>${escapeHTML(username)} · ${escapeHTML(date)}</span>
              </div>
            </button>

            ${feedFollowButton}
          </div>

          ${threadText}
          ${threadImage}

          <div class="thread-actions">
            <div class="action-left social-actions">
              <button
                class="social-action-btn like-action ${likedByUser ? "liked" : ""}"
                data-like-id="${escapeHTML(thread.id)}"
                type="button"
                aria-label="Like"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12.1 21.35 10.65 20.03C5.4 15.26 2 12.18 2 8.4 2 5.32 4.42 2.9 7.5 2.9c1.74 0 3.41.81 4.5 2.09C13.09 3.71 14.76 2.9 16.5 2.9 19.58 2.9 22 5.32 22 8.4c0 3.78-3.4 6.86-8.65 11.63l-1.25 1.32Z"></path>
                </svg>
                <span>${likeCount}</span>
              </button>

              <button
                class="social-action-btn reply-action"
                data-comments-id="${escapeHTML(thread.id)}"
                type="button"
                aria-label="Replies"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-2 12H6v-2h12v2Zm0-3H6V9h12v2Zm0-3H6V6h12v2Z"></path>
                </svg>
                <span>${commentCount}</span>
              </button>
            </div>

            <div class="thread-secondary-actions">
              ${deleteButton}
              ${moderationActions}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  bindThreadActions();
}

function bindThreadActions() {
  document.querySelectorAll("[data-profile-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openPublicProfile(button.dataset.profileId);
    });
  });

  document.querySelectorAll("[data-like-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.likeId;
      await likeThread(id);
    });
  });

  document.querySelectorAll("[data-comments-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.commentsId;

      if (typeof openCommentsModal === "function") {
        openCommentsModal(id);
      }
    });
  });

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deleteId;
      await deleteThread(id);
    });
  });

  if (typeof bindFollowButtons === "function") {
    bindFollowButtons();
  }

  if (typeof bindModerationButtons === "function") {
    bindModerationButtons();
  }
}

function updateFilterUI() {
  const allPostsBtn = document.getElementById("allPostsBtn");
  const myPostsBtn = document.getElementById("myPostsBtn");
  const followingPostsBtn = document.getElementById("followingPostsBtn");
  const feedTitle = document.getElementById("feedTitle");

  if (allPostsBtn) {
    allPostsBtn.classList.toggle("active", activeFilter === "all");
  }

  if (myPostsBtn) {
    myPostsBtn.classList.toggle("active", activeFilter === "mine");
  }

  if (followingPostsBtn) {
    followingPostsBtn.classList.toggle("active", activeFilter === "following");
  }

  if (!feedTitle) return;

  if (activeFilter === "mine") {
    feedTitle.textContent = typeof t === "function" ? t("myThreads") : "My Threads";
  } else if (activeFilter === "following") {
    feedTitle.textContent = typeof t === "function" ? t("following") : "Following";
  } else if (activeFilter === "profile") {
    feedTitle.textContent = typeof t === "function" ? t("profileThreads") : "Profile Threads";
  } else {
    feedTitle.textContent = typeof t === "function" ? t("latestThreads") : "Latest Threads";
  }
}

function setFilter(filter) {
  if (filter === "mine" && !currentUser) {
    setStatus(typeof t === "function" ? t("signIn") : "Sign in to see your posts.", "error");
    return;
  }

  if (filter === "following" && !currentUser) {
    setStatus(typeof t === "function" ? t("signIn") : "Sign in to see your following feed.", "error");
    return;
  }

  viewedProfileId = null;
  activeFilter = filter;

  updatePublicProfileUI();
  updateFilterUI();
  renderThreads();

  if (typeof closeUserSearchFocus === "function") {
    closeUserSearchFocus();
  }

  setBottomNavActive("home");
}

function openPublicProfile(userId) {
  viewedProfileId = userId;
  activeFilter = "profile";

  setBottomNavActive("home");
  updateFilterUI();
  updatePublicProfileUI();
  renderThreads();

  if (typeof markUserSearchProfileOpen === "function") {
    markUserSearchProfileOpen(userId);
  }

  const publicProfileView = document.getElementById("publicProfileView");

  if (publicProfileView) {
    publicProfileView.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function closePublicProfile() {
  viewedProfileId = null;
  activeFilter = "all";

  updatePublicProfileUI();
  updateFilterUI();
  renderThreads();
  setBottomNavActive("home");
}

function updatePublicProfileUI() {
  const publicProfileView = document.getElementById("publicProfileView");
  if (!publicProfileView) return;

  const publicProfileAvatar = document.getElementById("publicProfileAvatar");
  const publicProfileName = document.getElementById("publicProfileName");
  const publicProfileUsername = document.getElementById("publicProfileUsername");
  const publicProfileBio = document.getElementById("publicProfileBio");
  const publicProfilePosts = document.getElementById("publicProfilePosts");
  const publicProfileLikes = document.getElementById("publicProfileLikes");
  const publicProfileFollowers = document.getElementById("publicProfileFollowers");
  const publicProfileFollowing = document.getElementById("publicProfileFollowing");
  const publicProfileFollowWrap = document.getElementById("publicProfileFollowWrap");

  if (!viewedProfileId) {
    publicProfileView.classList.add("hidden");
    return;
  }

  if (typeof isModerationHiddenUser === "function" && isModerationHiddenUser(viewedProfileId)) {
    publicProfileView.classList.add("hidden");
    return;
  }

  const profile = getProfileByUserId(viewedProfileId);
  const userThreads = (typeof filterBlockedThreads === "function" ? filterBlockedThreads(threads) : threads)
    .filter((thread) => thread.user_id === viewedProfileId);

  if (!profile && !userThreads.length) {
    publicProfileView.classList.add("hidden");
    return;
  }

  const fallbackThread = userThreads[0] || {};

  const name =
    profile?.full_name ||
    fallbackThread.user_name ||
    "Loomyva User";

  const avatar =
    profile?.avatar_url ||
    fallbackThread.user_avatar ||
    fallbackAvatar(name || "User");

  const username = profile?.username ? `@${profile.username}` : "@user";

  const bio = profile?.bio || (typeof t === "function" ? t("noBioYet") : "No bio yet. This founder is moving in silence.");

  const postCount = userThreads.length;
  const totalLikes = getUserTotalLikes(viewedProfileId);

  const followerCount =
    typeof getFollowerCount === "function"
      ? getFollowerCount(viewedProfileId)
      : 0;

  const followingCount =
    typeof getFollowingCount === "function"
      ? getFollowingCount(viewedProfileId)
      : 0;

  if (publicProfileAvatar) {
    publicProfileAvatar.src = avatar;
  }

  if (publicProfileName) {
    publicProfileName.textContent = name;
  }

  if (publicProfileUsername) {
    publicProfileUsername.textContent = username;
  }

  if (publicProfilePosts) {
    publicProfilePosts.textContent = `${postCount} ${postCount === 1 ? (typeof t === "function" ? t("post") : "Post") : (typeof t === "function" ? t("posts") : "Posts")}`;
  }

  if (publicProfileLikes) {
    publicProfileLikes.textContent = `${totalLikes} ${typeof t === "function" ? t("totalLikes") : "Total Likes"}`;
  }

  if (publicProfileFollowers) {
    publicProfileFollowers.textContent = `${followerCount} ${followerCount === 1 ? (typeof t === "function" ? t("follower") : "Follower") : (typeof t === "function" ? t("followers") : "Followers")}`;
  }

  if (publicProfileFollowing) {
    publicProfileFollowing.textContent = `${followingCount} ${typeof t === "function" ? t("following") : "Following"}`;
  }

  if (publicProfileBio) {
    publicProfileBio.textContent = bio;
  }

  if (publicProfileFollowWrap) {
    if (!currentUser || viewedProfileId === currentUser.id) {
      publicProfileFollowWrap.innerHTML = "";
    } else if (typeof isModerationHiddenUser === "function" && isModerationHiddenUser(viewedProfileId)) {
      publicProfileFollowWrap.innerHTML = "";
    } else {
      const alreadyFollowing =
        typeof isFollowingUser === "function"
          ? isFollowingUser(viewedProfileId)
          : false;

      publicProfileFollowWrap.innerHTML = `
        <button
          class="btn ${alreadyFollowing ? "ghost-btn" : "primary-btn"} follow-btn"
          type="button"
          data-follow-user-id="${escapeHTML(viewedProfileId)}"
        >
          ${alreadyFollowing ? (typeof t === "function" ? t("following") : "Following") : (typeof t === "function" ? t("follow") : "Follow")}
        </button>

        <button
          class="btn ghost-btn moderation-action"
          type="button"
          data-report-user-id="${escapeHTML(viewedProfileId)}"
        >
          Report User
        </button>

        <button
          class="btn ghost-btn moderation-action danger-soft"
          type="button"
          data-block-user-id="${escapeHTML(viewedProfileId)}"
        >
          Block User
        </button>
      `;
    }
  }

  publicProfileView.classList.remove("hidden");

  if (typeof bindFollowButtons === "function") {
    bindFollowButtons();
  }

  if (typeof bindModerationButtons === "function") {
    bindModerationButtons();
  }
}

async function uploadThreadFromModal() {
  const modalThreadInput = document.getElementById("modalThreadInput");
  const modalUploadBtn = document.getElementById("modalUploadBtn");

  if (!modalThreadInput) return;

  const content = modalThreadInput.value.trim();
  const imageFile =
    typeof selectedThreadImageFile !== "undefined"
      ? selectedThreadImageFile
      : null;

  if (!currentUser) {
    setStatus(typeof t === "function" ? t("signInFirstThread") : "Sign in first to create a thread.", "error");
    signInWithGoogle();
    return;
  }

  if (!content && !imageFile) {
    setStatus(typeof t === "function" ? t("writeOrImage") : "Write something or add an image first.", "error");
    return;
  }

  if (content.length > 280) {
    setStatus(typeof t === "function" ? t("keepUnder280") : "Keep it under 280 characters.", "error");
    return;
  }

  if (modalUploadBtn) {
    modalUploadBtn.disabled = true;
    modalUploadBtn.textContent = imageFile ? (typeof t === "function" ? t("uploadingImage") : "Uploading image...") : (typeof t === "function" ? t("uploading") : "Uploading...");
  }

  let imageUrl = null;

  if (imageFile) {
    setStatus(typeof t === "function" ? t("uploadingImage") : "Uploading image...", "success");
    imageUrl = await uploadThreadImage(imageFile);

    if (!imageUrl) {
      if (modalUploadBtn) {
        modalUploadBtn.disabled = false;
        modalUploadBtn.textContent = typeof t === "function" ? t("upload") : "Upload";
      }

      return;
    }
  }

  if (modalUploadBtn) {
    modalUploadBtn.textContent = typeof t === "function" ? t("publishing") : "Publishing...";
  }

  const meta = getUserMeta(currentUser);

  const { error } = await supabaseClient
    .from("threads")
    .insert({
      user_id: currentUser.id,
      user_email: currentProfile?.email || meta.email,
      user_name: currentProfile?.full_name || meta.name,
      user_avatar: currentProfile?.avatar_url || meta.avatar,
      content,
      image_url: imageUrl
    });

  if (modalUploadBtn) {
    modalUploadBtn.disabled = false;
    modalUploadBtn.textContent = typeof t === "function" ? t("upload") : "Upload";
  }

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  modalThreadInput.value = "";
  updateModalCharCount();

  if (typeof resetThreadImagePicker === "function") {
    resetThreadImagePicker();
  }

  closeThreadModal();

  viewedProfileId = null;
  activeFilter = "all";

  updateFilterUI();
  setBottomNavActive("home");

  setStatus(typeof t === "function" ? t("threadUploaded") : "Thread uploaded 🚀", "success");

  await loadFeed();
}

async function likeThread(id) {
  if (!currentUser) {
    setStatus(typeof t === "function" ? t("signInLike") : "Sign in to like threads.", "error");
    return;
  }

  const targetThread = threads.find((thread) => thread.id === id);

  if (targetThread && typeof canInteractWithUser === "function" && !canInteractWithUser(targetThread.user_id)) {
    setStatus("You cannot interact with a blocked user.", "error");
    return;
  }

  const alreadyLiked = userLikedThread(id);

  if (alreadyLiked) {
    const { error } = await supabaseClient
      .from("thread_likes")
      .delete()
      .eq("thread_id", id)
      .eq("user_id", currentUser.id);

    if (error) {
      setStatus(error.message, "error");
      return;
    }

    setStatus(typeof t === "function" ? t("likeRemoved") : "Like removed.");
  } else {
    const { error } = await supabaseClient
      .from("thread_likes")
      .insert({
        thread_id: id,
        user_id: currentUser.id
      });

    if (error) {
      setStatus(error.message, "error");
      return;
    }

    if (typeof createLikeNotification === "function") {
      await createLikeNotification(id);
    }

    setStatus(typeof t === "function" ? t("liked") : "Liked 🚀", "success");
  }

  await loadFeed();
}

async function deleteThread(id) {
  if (!currentUser) {
    setStatus("You need to be logged in.", "error");
    return;
  }

  const { error } = await supabaseClient
    .from("threads")
    .delete()
    .eq("id", id);

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  setStatus("Thread deleted.", "success");
  await loadFeed();
}

function subscribeToRealtime() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel("loomyva-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "threads"
      },
      async () => {
        await loadFeed();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "thread_likes"
      },
      async () => {
        await loadFeed();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "profiles"
      },
      async () => {
        await loadFeed();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "thread_comments"
      },
      async () => {
        await loadFeed();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "thread_follows"
      },
      async () => {
        await loadFeed();
      }
    )
    .subscribe();
}

function setupFeedButtons() {
  const allPostsBtn = document.getElementById("allPostsBtn");
  const myPostsBtn = document.getElementById("myPostsBtn");
  const followingPostsBtn = document.getElementById("followingPostsBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const backToFeedBtn = document.getElementById("backToFeedBtn");

  if (allPostsBtn) {
    allPostsBtn.addEventListener("click", () => setFilter("all"));
  }

  if (myPostsBtn) {
    myPostsBtn.addEventListener("click", () => setFilter("mine"));
  }

  if (followingPostsBtn) {
    followingPostsBtn.addEventListener("click", () => setFilter("following"));
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      setStatus("Refreshing...");
      await loadFeed();
    });
  }

  if (backToFeedBtn) {
    backToFeedBtn.addEventListener("click", closePublicProfile);
  }
}

async function initFeedPage() {
  appStarted = false;

  updateFilterUI();
  setBottomNavActive("home");

  setupAuthButtons();
  setupFeedButtons();

  mountSharedUI({ includeModal: true });

  if (typeof setupCommentsModal === "function") {
    setupCommentsModal();
  }

  await restoreSession();
  if (typeof loadModerationData === "function") {
    await loadModerationData();
  }
  await loadFeed();

  window.addEventListener("loomyva:language-change", () => {
    updateFilterUI();
    updatePublicProfileUI();
    renderThreads();
  });

  const params = new URLSearchParams(window.location.search);

  if (params.get("compose") === "1") {
    setTimeout(() => {
      openThreadModal();

      window.history.replaceState({}, document.title, window.location.pathname);
    }, 400);
  }

  const profileParam = params.get("profile");

  if (profileParam) {
    setTimeout(() => {
      openPublicProfile(profileParam);
      window.history.replaceState({}, document.title, window.location.pathname);
    }, 250);
  }

  listenForAuthChanges({
    onSignedIn: async () => {
      if (typeof loadModerationData === "function") {
        await loadModerationData();
      }
      await loadFeed();

      if (typeof initNotificationsSystem === "function") {
        await initNotificationsSystem();
      }
    },
    onSignedOut: async () => {
      currentProfile = null;
      if (typeof loadModerationData === "function") {
        await loadModerationData();
      }
      activeFilter = "all";
      viewedProfileId = null;

      updateFilterUI();
      updatePublicProfileUI();
      setBottomNavActive("home");

      await loadFeed();

      if (typeof resetNotificationsSystem === "function") {
        resetNotificationsSystem();
      }
    }
  });

  subscribeToRealtime();

  appStarted = true;
}
