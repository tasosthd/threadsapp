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
    .select("*");

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

  if (totalThreads) {
    totalThreads.textContent = threads.length;
  }

  if (myThreads) {
    const ownCount = currentUser
      ? threads.filter((thread) => thread.user_id === currentUser.id).length
      : 0;

    myThreads.textContent = ownCount;
  }
}

function getVisibleThreads() {
  if (viewedProfileId) {
    return threads.filter((thread) => thread.user_id === viewedProfileId);
  }

  if (activeFilter === "mine" && currentUser) {
    return threads.filter((thread) => thread.user_id === currentUser.id);
  }

  if (activeFilter === "following" && currentUser) {
    if (typeof getFollowingIdsForCurrentUser !== "function") {
      return [];
    }

    const followingIds = getFollowingIdsForCurrentUser();

    return threads.filter((thread) => followingIds.includes(thread.user_id));
  }

  return threads;
}

function renderThreads() {
  const threadsList = document.getElementById("threadsList");
  if (!threadsList) return;

  const visibleThreads = getVisibleThreads();

  if (!visibleThreads.length) {
    const message = viewedProfileId
      ? "This profile has not posted yet."
      : activeFilter === "mine"
        ? "You have not posted yet. Drop your first founder thought."
        : activeFilter === "following"
          ? "No posts from people you follow yet. Follow some creators first."
          : "Be the first founder to post something powerful.";

    threadsList.innerHTML = `
      <div class="empty-state">
        <strong>No threads yet.</strong>
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

      const avatar =
        profile?.avatar_url ||
        thread.user_avatar ||
        fallbackAvatar(thread.user_email || "User");

      const name =
        profile?.full_name ||
        thread.user_name ||
        "User";

      const username =
        profile?.username
          ? `@${profile.username}`
          : thread.user_email || "";

      const content = escapeHTML(thread.content || "");
      const date = formatDate(thread.created_at);

      const canFollowUser = currentUser && thread.user_id !== currentUser.id;

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
            ${alreadyFollowing ? "Following" : "Follow"}
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

      return `
        <article class="thread-card">
          <div class="thread-top">
            <button class="thread-user" data-profile-id="${escapeHTML(thread.user_id)}">
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
            <div class="action-left">
              <button
                class="mini-action like-action ${likedByUser ? "liked" : ""}"
                data-like-id="${escapeHTML(thread.id)}"
              >
                ${likedByUser ? "♥ Liked" : "♡ Like"} · ${likeCount}
              </button>

              <button
                class="mini-action reply-action"
                data-comments-id="${escapeHTML(thread.id)}"
              >
                Reply · ${commentCount}
              </button>
            </div>

            ${
              isOwner
                ? `<button class="mini-action delete-action" data-delete-id="${escapeHTML(thread.id)}">Delete</button>`
                : ""
            }
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
    feedTitle.textContent = "My Threads";
  } else if (activeFilter === "following") {
    feedTitle.textContent = "Following";
  } else if (activeFilter === "profile") {
    feedTitle.textContent = "Profile Threads";
  } else {
    feedTitle.textContent = "Latest Threads";
  }
}

function setFilter(filter) {
  if (filter === "mine" && !currentUser) {
    setStatus("Sign in to see your posts.", "error");
    return;
  }

  if (filter === "following" && !currentUser) {
    setStatus("Sign in to see your following feed.", "error");
    return;
  }

  viewedProfileId = null;
  activeFilter = filter;

  updatePublicProfileUI();
  updateFilterUI();
  renderThreads();
  setBottomNavActive("home");
}

function openPublicProfile(userId) {
  viewedProfileId = userId;
  activeFilter = "profile";

  setBottomNavActive("home");
  updateFilterUI();
  updatePublicProfileUI();
  renderThreads();

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

  const profile = getProfileByUserId(viewedProfileId);
  const userThreads = threads.filter((thread) => thread.user_id === viewedProfileId);

  if (!profile && !userThreads.length) {
    publicProfileView.classList.add("hidden");
    return;
  }

  const fallbackThread = userThreads[0] || {};

  const avatar =
    profile?.avatar_url ||
    fallbackThread.user_avatar ||
    fallbackAvatar(fallbackThread.user_email || "User");

  const name =
    profile?.full_name ||
    fallbackThread.user_name ||
    "ThreadWave User";

  const username =
    profile?.username
      ? `@${profile.username}`
      : fallbackThread.user_email || "@user";

  const bio = profile?.bio || "No bio yet. This founder is moving in silence.";

  if (publicProfileAvatar) publicProfileAvatar.src = avatar;
  if (publicProfileName) publicProfileName.textContent = name;
  if (publicProfileUsername) publicProfileUsername.textContent = username;
  if (publicProfileBio) publicProfileBio.textContent = bio;

  if (publicProfilePosts) {
    publicProfilePosts.textContent = `${userThreads.length} ${userThreads.length === 1 ? "post" : "posts"}`;
  }

  if (publicProfileLikes) {
    publicProfileLikes.textContent = `${getUserTotalLikes(viewedProfileId)} total likes`;
  }

  if (publicProfileFollowers && typeof getFollowerCount === "function") {
    const followerCount = getFollowerCount(viewedProfileId);
    publicProfileFollowers.textContent = `${followerCount} ${followerCount === 1 ? "follower" : "followers"}`;
  }

  if (publicProfileFollowing && typeof getFollowingCount === "function") {
    const followingCount = getFollowingCount(viewedProfileId);
    publicProfileFollowing.textContent = `${followingCount} following`;
  }

  if (publicProfileFollowWrap) {
    if (!currentUser || viewedProfileId === currentUser.id) {
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
          ${alreadyFollowing ? "Following" : "Follow"}
        </button>
      `;
    }
  }

  publicProfileView.classList.remove("hidden");

  if (typeof bindFollowButtons === "function") {
    bindFollowButtons();
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
    setStatus("Sign in first to create a thread.", "error");
    signInWithGoogle();
    return;
  }

  if (!content && !imageFile) {
    setStatus("Write something or add an image first.", "error");
    return;
  }

  if (content.length > 280) {
    setStatus("Keep it under 280 characters.", "error");
    return;
  }

  if (modalUploadBtn) {
    modalUploadBtn.disabled = true;
    modalUploadBtn.textContent = imageFile ? "Uploading image..." : "Uploading...";
  }

  let imageUrl = null;

  if (imageFile) {
    setStatus("Uploading image...", "success");
    imageUrl = await uploadThreadImage(imageFile);

    if (!imageUrl) {
      if (modalUploadBtn) {
        modalUploadBtn.disabled = false;
        modalUploadBtn.textContent = "Upload";
      }

      return;
    }
  }

  if (modalUploadBtn) {
    modalUploadBtn.textContent = "Publishing...";
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
    modalUploadBtn.textContent = "Upload";
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

  setStatus("Thread uploaded 🚀", "success");

  await loadFeed();
}

async function likeThread(id) {
  if (!currentUser) {
    setStatus("Sign in to like threads.", "error");
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

    setStatus("Like removed.");
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

    setStatus("Liked 🚀", "success");
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
    .channel("threadwave-realtime")
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
  await loadFeed();

  const params = new URLSearchParams(window.location.search);

  if (params.get("compose") === "1") {
    setTimeout(() => {
      openThreadModal();

      window.history.replaceState({}, document.title, window.location.pathname);
    }, 400);
  }

  listenForAuthChanges({
    onSignedIn: async () => {
      await loadFeed();
    },
    onSignedOut: async () => {
      currentProfile = null;
      activeFilter = "all";
      viewedProfileId = null;

      updateFilterUI();
      updatePublicProfileUI();
      setBottomNavActive("home");

      await loadFeed();
    }
  });

  subscribeToRealtime();

  appStarted = true;
}
