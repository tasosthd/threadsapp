let profileThreads = [];
let profileLikes = [];
let profileData = null;
let pendingDeleteThreadId = null;
let latestUploadedAvatarUrl = null;
let profileFollowersCount = 0;
let profileFollowingCount = 0;
let profileRealtimeChannel = null;
let profileFollowingModalLoaded = false;
let profileViewingModalUserId = null;

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

function getSafeProfileName(profile, fallbackId = "User") {
  return profile?.full_name || profile?.username || profile?.email || fallbackId || "Loomyva User";
}

function getSafeUsername(profile) {
  if (profile?.username) return `@${profile.username}`;
  if (profile?.email) return profile.email;
  return "Loomyva creator";
}

function getSafeBio(profile) {
  return profile?.bio || "Building and posting on Loomyva.";
}

function getSafeAvatar(profile, fallbackName = "User") {
  return profile?.avatar_url || fallbackAvatar(fallbackName);
}

function getProfileModalPostLikeCount(threadId, modalLikes) {
  return (modalLikes || []).filter((like) => like.thread_id === threadId).length;
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
    latestUploadedAvatarUrl ||
    profileData?.avatar_url ||
    currentProfile?.avatar_url ||
    meta.avatar ||
    fallbackAvatar(meta.email || "User");

  const name =
    profileData?.full_name ||
    currentProfile?.full_name ||
    meta.name ||
    "Loomyva User";

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
  const profileFollowerCount = document.getElementById("profileFollowerCount");
  const profileFollowingCountElement = document.getElementById("profileFollowingCount");

  if (profilePostCount) {
    profilePostCount.textContent = profileThreads.length;
  }

  if (profileLikeCount) {
    profileLikeCount.textContent = getProfileTotalLikes();
  }

  if (profileFollowerCount) {
    profileFollowerCount.textContent = profileFollowersCount;

    const followerStatCard = profileFollowerCount.closest("div");

    if (followerStatCard) {
      followerStatCard.setAttribute("aria-label", `Open followers list. ${profileFollowersCount} followers`);
    }
  }

  if (profileFollowingCountElement) {
    profileFollowingCountElement.textContent = profileFollowingCount;

    const followingStatCard = profileFollowingCountElement.closest("div");

    if (followingStatCard) {
      followingStatCard.setAttribute("aria-label", `Open following list. ${profileFollowingCount} following`);
    }
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
        <strong>${typeof t === "function" ? t("noThreadsYet") : "No posts yet."}</strong>
        Your profile posts will appear here after you upload your first thread.
      </div>
    `;
    return;
  }

  profilePostsList.innerHTML = profileThreads
    .map((thread) => {
      const avatar =
        latestUploadedAvatarUrl ||
        profileData?.avatar_url ||
        currentProfile?.avatar_url ||
        thread.user_avatar ||
        fallbackAvatar(thread.user_email || "User");

      const name =
        profileData?.full_name ||
        currentProfile?.full_name ||
        thread.user_name ||
        "Loomyva User";

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
   FOLLOW DATABASE ACTIONS
========================= */

async function isCurrentUserFollowing(targetUserId) {
  if (!currentUser || !targetUserId) return false;
  if (targetUserId === currentUser.id) return false;

  const { data, error } = await supabaseClient
    .from("thread_follows")
    .select("id")
    .eq("follower_id", currentUser.id)
    .eq("following_id", targetUserId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
}

async function followUserFromProfile(targetUserId) {
  if (!currentUser) {
    setStatus("Sign in first to follow creators.", "error");
    return false;
  }

  if (!targetUserId || targetUserId === currentUser.id) {
    return false;
  }

  const alreadyFollowing = await isCurrentUserFollowing(targetUserId);

  if (alreadyFollowing) {
    return true;
  }

  const { error } = await supabaseClient
    .from("thread_follows")
    .insert({
      follower_id: currentUser.id,
      following_id: targetUserId
    });

  if (error) {
    setStatus(error.message, "error");
    return false;
  }

  if (typeof createFollowNotification === "function") {
    await createFollowNotification(targetUserId);
  }

  setStatus(typeof t === "function" ? t("followed") : "Followed creator 🚀", "success");
  return true;
}

async function unfollowUserFromProfile(targetUserId) {
  if (!currentUser) {
    setStatus(typeof t === "function" ? t("signIn") : "Sign in first.", "error");
    return false;
  }

  if (!targetUserId || targetUserId === currentUser.id) {
    return false;
  }

  const { error } = await supabaseClient
    .from("thread_follows")
    .delete()
    .eq("follower_id", currentUser.id)
    .eq("following_id", targetUserId);

  if (error) {
    setStatus(error.message, "error");
    return false;
  }

  setStatus(typeof t === "function" ? t("unfollowed") : "Unfollowed creator.", "success");
  return true;
}

async function toggleFollowFromProfileModal(targetUserId) {
  const profileUserModalFollowBtn = document.getElementById("profileUserModalFollowBtn");

  if (!profileUserModalFollowBtn || !targetUserId) return;

  profileUserModalFollowBtn.disabled = true;
  profileUserModalFollowBtn.textContent = "Updating...";

  const following = await isCurrentUserFollowing(targetUserId);
  const success = following
    ? await unfollowUserFromProfile(targetUserId)
    : await followUserFromProfile(targetUserId);

  if (success) {
    await loadProfileFollowStats();

    const followingModalBackdrop = document.getElementById("followingModalBackdrop");
    const followersModalBackdrop = document.getElementById("followersModalBackdrop");

    if (followingModalBackdrop?.classList.contains("active")) {
      await loadProfileFollowingList();
    }

    if (followersModalBackdrop?.classList.contains("active")) {
      await loadProfileFollowersList();
    }

    await loadProfileUserModal(targetUserId);
  }

  profileUserModalFollowBtn.disabled = false;
}

async function unfollowUserDirectlyFromFollowingModal(targetUserId) {
  if (!targetUserId) return;

  const button = document.querySelector(`[data-direct-unfollow-user-id="${CSS.escape(targetUserId)}"]`);

  if (button) {
    button.disabled = true;
    button.textContent = "Unfollowing...";
  }

  const success = await unfollowUserFromProfile(targetUserId);

  if (success) {
    await loadProfileFollowStats();
    await loadProfileFollowingList();

    if (profileViewingModalUserId === targetUserId) {
      await loadProfileUserModal(targetUserId);
    }
  } else if (button) {
    button.disabled = false;
    button.textContent = "Unfollow";
  }
}

/* =========================
   FOLLOWING LIST MODAL
========================= */

function renderFollowingModalShell() {
  return `
    <div id="followingModalBackdrop" class="following-modal-backdrop" aria-hidden="true">
      <section class="following-modal" role="dialog" aria-modal="true" aria-labelledby="followingModalTitle">
        <div class="following-modal-head">
          <div>
            <span class="eyebrow">Social graph</span>
            <h2 id="followingModalTitle">Following</h2>
            <p>People you follow on Loomyva.</p>
          </div>

          <button id="followingModalCloseBtn" class="following-modal-close" type="button" aria-label="Close following list">
            <span></span>
            <span></span>
          </button>
        </div>

        <div id="followingModalList" class="following-modal-list">
          <div class="following-modal-state">Loading creators...</div>
        </div>
      </section>
    </div>
  `;
}

function setupFollowingModal() {
  if (!document.getElementById("followingModalBackdrop")) {
    document.body.insertAdjacentHTML("beforeend", renderFollowingModalShell());
  }

  const followingModalBackdrop = document.getElementById("followingModalBackdrop");
  const followingModalCloseBtn = document.getElementById("followingModalCloseBtn");

  if (followingModalCloseBtn) {
    followingModalCloseBtn.addEventListener("click", closeFollowingModal);
  }

  if (followingModalBackdrop) {
    followingModalBackdrop.addEventListener("click", (event) => {
      if (event.target === followingModalBackdrop) {
        closeFollowingModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFollowingModal();
      closeFollowersModal();
      closeProfileUserModal();
    }
  });
}

function openFollowingModal() {
  if (!currentUser) {
    setStatus("Sign in first to see who you follow.", "error");
    return;
  }

  const followingModalBackdrop = document.getElementById("followingModalBackdrop");

  if (!followingModalBackdrop) return;

  followingModalBackdrop.classList.add("active");
  followingModalBackdrop.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  loadProfileFollowingList();
}

function closeFollowingModal() {
  const followingModalBackdrop = document.getElementById("followingModalBackdrop");

  if (!followingModalBackdrop) return;

  followingModalBackdrop.classList.remove("active");
  followingModalBackdrop.setAttribute("aria-hidden", "true");

  const followersModalBackdrop = document.getElementById("followersModalBackdrop");
  const profileUserModalBackdrop = document.getElementById("profileUserModalBackdrop");

  if (
    !followersModalBackdrop?.classList.contains("active") &&
    !profileUserModalBackdrop?.classList.contains("active")
  ) {
    document.body.style.overflow = "";
  }
}

function renderFollowingRows(followRows, followedProfiles) {
  const followingModalList = document.getElementById("followingModalList");

  if (!followingModalList) return;

  if (!followRows.length) {
    followingModalList.innerHTML = `
      <div class="following-modal-empty">
        <strong>No following yet.</strong>
        <span>Follow creators from the feed and they’ll appear here.</span>
      </div>
    `;
    return;
  }

  const profileById = new Map((followedProfiles || []).map((profile) => [profile.id, profile]));

  followingModalList.innerHTML = followRows
    .map((follow) => {
      const profile = profileById.get(follow.following_id) || null;
      const name = getSafeProfileName(profile, follow.following_id);
      const username = getSafeUsername(profile);
      const avatar = getSafeAvatar(profile, name);

      return `
        <article class="following-person-card instagram-following-row">
          <button
            class="following-profile-open-area"
            type="button"
            data-open-profile-user-id="${escapeHTML(follow.following_id)}"
            aria-label="Open ${escapeHTML(name)} profile"
          >
            <img src="${escapeHTML(avatar)}" alt="${escapeHTML(name)} avatar" loading="lazy" />

            <div class="following-person-info">
              <strong>${escapeHTML(name)}</strong>
              <span>${escapeHTML(username)}</span>
            </div>
          </button>

          <button
            class="mini-action following-unfollow-btn"
            type="button"
            data-direct-unfollow-user-id="${escapeHTML(follow.following_id)}"
          >
            Unfollow
          </button>
        </article>
      `;
    })
    .join("");

  bindFollowingPersonCards();
  bindFollowingUnfollowButtons();
}

function bindFollowingPersonCards() {
  document.querySelectorAll("#followingModalList [data-open-profile-user-id]").forEach((card) => {
    if (card.dataset.profileCardReady === "true") return;

    card.dataset.profileCardReady = "true";

    card.addEventListener("click", () => {
      openProfileUserModal(card.dataset.openProfileUserId);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProfileUserModal(card.dataset.openProfileUserId);
      }
    });
  });
}

function bindFollowingUnfollowButtons() {
  document.querySelectorAll("[data-direct-unfollow-user-id]").forEach((button) => {
    if (button.dataset.unfollowReady === "true") return;

    button.dataset.unfollowReady = "true";

    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await unfollowUserDirectlyFromFollowingModal(button.dataset.directUnfollowUserId);
    });
  });
}

async function loadProfileFollowingList() {
  const followingModalList = document.getElementById("followingModalList");

  if (!currentUser || !followingModalList) return;

  profileFollowingModalLoaded = false;
  followingModalList.innerHTML = `<div class="following-modal-state">Loading creators...</div>`;

  const { data: followRows, error: followsError } = await supabaseClient
    .from("thread_follows")
    .select("following_id, created_at")
    .eq("follower_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (followsError) {
    followingModalList.innerHTML = `
      <div class="following-modal-empty error">
        <strong>Could not load following.</strong>
        <span>${escapeHTML(followsError.message)}</span>
      </div>
    `;
    return;
  }

  const safeFollowRows = followRows || [];
  const followedIds = [...new Set(safeFollowRows.map((follow) => follow.following_id).filter(Boolean))];

  if (!followedIds.length) {
    profileFollowingModalLoaded = true;
    renderFollowingRows([], []);
    return;
  }

  const { data: followedProfiles, error: profilesError } = await supabaseClient
    .from("profiles")
    .select("id, full_name, username, email, avatar_url, bio")
    .in("id", followedIds);

  if (profilesError) {
    followingModalList.innerHTML = `
      <div class="following-modal-empty error">
        <strong>Could not load creators.</strong>
        <span>${escapeHTML(profilesError.message)}</span>
      </div>
    `;
    return;
  }

  profileFollowingModalLoaded = true;
  renderFollowingRows(safeFollowRows, followedProfiles || []);
}

function setupFollowingStatButton() {
  const profileFollowingCountElement = document.getElementById("profileFollowingCount");
  const followingStatCard = profileFollowingCountElement?.closest("div");

  if (!followingStatCard || followingStatCard.dataset.followingClickReady === "true") return;

  followingStatCard.dataset.followingClickReady = "true";
  followingStatCard.classList.add("clickable-stat-card");
  followingStatCard.setAttribute("role", "button");
  followingStatCard.setAttribute("tabindex", "0");
  followingStatCard.setAttribute("aria-label", "Open following list");

  followingStatCard.addEventListener("click", openFollowingModal);

  followingStatCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFollowingModal();
    }
  });
}

/* =========================
   FOLLOWERS LIST MODAL
========================= */

function renderFollowersModalShell() {
  return `
    <div id="followersModalBackdrop" class="followers-modal-backdrop" aria-hidden="true">
      <section class="followers-modal" role="dialog" aria-modal="true" aria-labelledby="followersModalTitle">
        <div class="followers-modal-head">
          <div>
            <span class="eyebrow">Social graph</span>
            <h2 id="followersModalTitle">Followers</h2>
            <p>People who follow you on Loomyva.</p>
          </div>

          <button id="followersModalCloseBtn" class="followers-modal-close" type="button" aria-label="Close followers list">
            <span></span>
            <span></span>
          </button>
        </div>

        <div id="followersModalList" class="followers-modal-list">
          <div class="followers-modal-state">Loading followers...</div>
        </div>
      </section>
    </div>
  `;
}

function setupFollowersModal() {
  if (!document.getElementById("followersModalBackdrop")) {
    document.body.insertAdjacentHTML("beforeend", renderFollowersModalShell());
  }

  const followersModalBackdrop = document.getElementById("followersModalBackdrop");
  const followersModalCloseBtn = document.getElementById("followersModalCloseBtn");

  if (followersModalCloseBtn) {
    followersModalCloseBtn.addEventListener("click", closeFollowersModal);
  }

  if (followersModalBackdrop) {
    followersModalBackdrop.addEventListener("click", (event) => {
      if (event.target === followersModalBackdrop) {
        closeFollowersModal();
      }
    });
  }
}

function openFollowersModal() {
  if (!currentUser) {
    setStatus("Sign in first to see your followers.", "error");
    return;
  }

  const followersModalBackdrop = document.getElementById("followersModalBackdrop");

  if (!followersModalBackdrop) return;

  followersModalBackdrop.classList.add("active");
  followersModalBackdrop.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  loadProfileFollowersList();
}

function closeFollowersModal() {
  const followersModalBackdrop = document.getElementById("followersModalBackdrop");

  if (!followersModalBackdrop) return;

  followersModalBackdrop.classList.remove("active");
  followersModalBackdrop.setAttribute("aria-hidden", "true");

  const followingModalBackdrop = document.getElementById("followingModalBackdrop");
  const profileUserModalBackdrop = document.getElementById("profileUserModalBackdrop");

  if (
    !followingModalBackdrop?.classList.contains("active") &&
    !profileUserModalBackdrop?.classList.contains("active")
  ) {
    document.body.style.overflow = "";
  }
}

function setupFollowersStatButton() {
  const profileFollowerCountElement = document.getElementById("profileFollowerCount");
  const followerStatCard = profileFollowerCountElement?.closest("div");

  if (!followerStatCard || followerStatCard.dataset.followersClickReady === "true") return;

  followerStatCard.dataset.followersClickReady = "true";
  followerStatCard.classList.add("clickable-stat-card");
  followerStatCard.setAttribute("role", "button");
  followerStatCard.setAttribute("tabindex", "0");
  followerStatCard.setAttribute("aria-label", "Open followers list");

  followerStatCard.addEventListener("click", openFollowersModal);

  followerStatCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFollowersModal();
    }
  });
}

async function loadProfileFollowersList() {
  const followersModalList = document.getElementById("followersModalList");

  if (!currentUser || !followersModalList) return;

  followersModalList.innerHTML = `<div class="followers-modal-state">Loading followers...</div>`;

  const { data: followRows, error: followsError } = await supabaseClient
    .from("thread_follows")
    .select("follower_id, created_at")
    .eq("following_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (followsError) {
    followersModalList.innerHTML = `
      <div class="followers-modal-empty error">
        <strong>Could not load followers.</strong>
        <span>${escapeHTML(followsError.message)}</span>
      </div>
    `;
    return;
  }

  const safeFollowRows = followRows || [];
  const followerIds = [...new Set(safeFollowRows.map((follow) => follow.follower_id).filter(Boolean))];

  if (!followerIds.length) {
    followersModalList.innerHTML = `
      <div class="followers-modal-empty">
        <strong>No followers yet.</strong>
        <span>Keep posting. Your audience will show up here.</span>
      </div>
    `;
    return;
  }

  const { data: followerProfiles, error: profilesError } = await supabaseClient
    .from("profiles")
    .select("id, full_name, username, email, avatar_url, bio")
    .in("id", followerIds);

  if (profilesError) {
    followersModalList.innerHTML = `
      <div class="followers-modal-empty error">
        <strong>Could not load follower profiles.</strong>
        <span>${escapeHTML(profilesError.message)}</span>
      </div>
    `;
    return;
  }

  renderFollowerRows(safeFollowRows, followerProfiles || []);
}

function renderFollowerRows(followRows, followerProfiles) {
  const followersModalList = document.getElementById("followersModalList");

  if (!followersModalList) return;

  const profileById = new Map((followerProfiles || []).map((profile) => [profile.id, profile]));

  followersModalList.innerHTML = followRows
    .map((follow) => {
      const profile = profileById.get(follow.follower_id) || null;
      const name = getSafeProfileName(profile, follow.follower_id);
      const username = getSafeUsername(profile);
      const avatar = getSafeAvatar(profile, name);
      const isOwnProfile = currentUser && follow.follower_id === currentUser.id;

      return `
        <article class="followers-person-card instagram-followers-row">
          <button
            class="followers-profile-open-area"
            type="button"
            data-open-profile-user-id="${escapeHTML(follow.follower_id)}"
            aria-label="Open ${escapeHTML(name)} profile"
          >
            <img src="${escapeHTML(avatar)}" alt="${escapeHTML(name)} avatar" loading="lazy" />

            <div class="followers-person-info">
              <strong>${escapeHTML(name)}</strong>
              <span>${escapeHTML(username)}</span>
            </div>
          </button>

          ${
            isOwnProfile
              ? `
                <button class="mini-action followers-follow-btn" type="button" disabled>
                  You
                </button>
              `
              : `
                <button
                  class="mini-action followers-follow-btn"
                  type="button"
                  data-follower-action-user-id="${escapeHTML(follow.follower_id)}"
                >
                  Loading...
                </button>
              `
          }
        </article>
      `;
    })
    .join("");

  bindFollowerProfileCards();
  setupFollowerActionButtons();
}

function bindFollowerProfileCards() {
  document.querySelectorAll("#followersModalList [data-open-profile-user-id]").forEach((button) => {
    if (button.dataset.followerProfileReady === "true") return;

    button.dataset.followerProfileReady = "true";

    button.addEventListener("click", () => {
      openProfileUserModal(button.dataset.openProfileUserId);
    });

    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProfileUserModal(button.dataset.openProfileUserId);
      }
    });
  });
}

async function setupFollowerActionButtons() {
  const buttons = document.querySelectorAll("[data-follower-action-user-id]");

  for (const button of buttons) {
    const targetUserId = button.dataset.followerActionUserId;
    const following = await isCurrentUserFollowing(targetUserId);

    button.textContent = following ? (typeof t === "function" ? t("following") : "Following") : (typeof t === "function" ? t("follow") : "Follow");
    button.classList.toggle("following", following);

    if (button.dataset.followerActionReady === "true") continue;

    button.dataset.followerActionReady = "true";

    button.addEventListener("click", async (event) => {
      event.stopPropagation();

      button.disabled = true;
      button.textContent = "Updating...";

      const currentlyFollowing = await isCurrentUserFollowing(targetUserId);

      const success = currentlyFollowing
        ? await unfollowUserFromProfile(targetUserId)
        : await followUserFromProfile(targetUserId);

      if (success) {
        await loadProfileFollowStats();

        const updatedFollowing = await isCurrentUserFollowing(targetUserId);

        button.textContent = updatedFollowing ? (typeof t === "function" ? t("following") : "Following") : (typeof t === "function" ? t("follow") : "Follow");
        button.classList.toggle("following", updatedFollowing);

        if (profileViewingModalUserId === targetUserId) {
          await loadProfileUserModal(targetUserId);
        }
      } else {
        button.textContent = "Try again";
      }

      button.disabled = false;
    });
  }
}

/* =========================
   USER PROFILE MODAL
========================= */

function renderProfileUserModalShell() {
  return `
    <div id="profileUserModalBackdrop" class="profile-user-modal-backdrop" aria-hidden="true">
      <section class="profile-user-modal" role="dialog" aria-modal="true" aria-labelledby="profileUserModalName">
        <button id="profileUserModalCloseBtn" class="profile-user-modal-close" type="button" aria-label="Close profile">
          <span></span>
          <span></span>
        </button>

        <div id="profileUserModalBody" class="profile-user-modal-body">
          <div class="profile-user-modal-state">Loading profile...</div>
        </div>
      </section>
    </div>
  `;
}

function setupProfileUserModal() {
  if (!document.getElementById("profileUserModalBackdrop")) {
    document.body.insertAdjacentHTML("beforeend", renderProfileUserModalShell());
  }

  const profileUserModalBackdrop = document.getElementById("profileUserModalBackdrop");
  const profileUserModalCloseBtn = document.getElementById("profileUserModalCloseBtn");

  if (profileUserModalCloseBtn) {
    profileUserModalCloseBtn.addEventListener("click", closeProfileUserModal);
  }

  if (profileUserModalBackdrop) {
    profileUserModalBackdrop.addEventListener("click", (event) => {
      if (event.target === profileUserModalBackdrop) {
        closeProfileUserModal();
      }
    });
  }
}

function openProfileUserModal(userId) {
  if (!userId) return;

  profileViewingModalUserId = userId;

  const profileUserModalBackdrop = document.getElementById("profileUserModalBackdrop");

  if (!profileUserModalBackdrop) return;

  profileUserModalBackdrop.classList.add("active");
  profileUserModalBackdrop.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  loadProfileUserModal(userId);
}

function closeProfileUserModal() {
  profileViewingModalUserId = null;

  const profileUserModalBackdrop = document.getElementById("profileUserModalBackdrop");

  if (!profileUserModalBackdrop) return;

  profileUserModalBackdrop.classList.remove("active");
  profileUserModalBackdrop.setAttribute("aria-hidden", "true");

  const followingModalBackdrop = document.getElementById("followingModalBackdrop");
  const followersModalBackdrop = document.getElementById("followersModalBackdrop");

  if (
    !followingModalBackdrop?.classList.contains("active") &&
    !followersModalBackdrop?.classList.contains("active")
  ) {
    document.body.style.overflow = "";
  }
}

async function getUserProfileStats(userId) {
  const userThreadsRequest = supabaseClient
    .from("threads")
    .select("id")
    .eq("user_id", userId);

  const followersRequest = supabaseClient
    .from("thread_follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", userId);

  const followingRequest = supabaseClient
    .from("thread_follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", userId);

  const [userThreadsResponse, followersResponse, followingResponse] = await Promise.all([
    userThreadsRequest,
    followersRequest,
    followingRequest
  ]);

  if (userThreadsResponse.error) throw userThreadsResponse.error;
  if (followersResponse.error) throw followersResponse.error;
  if (followingResponse.error) throw followingResponse.error;

  const userThreadIds = (userThreadsResponse.data || []).map((thread) => thread.id);
  let totalLikes = 0;

  if (userThreadIds.length) {
    const { count, error } = await supabaseClient
      .from("thread_likes")
      .select("*", { count: "exact", head: true })
      .in("thread_id", userThreadIds);

    if (error) throw error;

    totalLikes = count || 0;
  }

  return {
    posts: userThreadIds.length,
    likes: totalLikes,
    followers: followersResponse.count || 0,
    following: followingResponse.count || 0
  };
}

async function getProfileModalPosts(userId) {
  const { data: modalThreads, error: threadsError } = await supabaseClient
    .from("threads")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(6);

  if (threadsError) throw threadsError;

  const safeModalThreads = modalThreads || [];
  const modalThreadIds = safeModalThreads.map((thread) => thread.id);

  if (!modalThreadIds.length) {
    return {
      threads: [],
      likes: []
    };
  }

  const { data: modalLikes, error: likesError } = await supabaseClient
    .from("thread_likes")
    .select("*")
    .in("thread_id", modalThreadIds);

  if (likesError) throw likesError;

  return {
    threads: safeModalThreads,
    likes: modalLikes || []
  };
}

function renderProfileModalPosts(modalThreads, modalLikes) {
  if (!modalThreads.length) {
    return `
      <section class="profile-user-modal-posts">
        <div class="profile-user-modal-posts-head">
          <span class="eyebrow">Latest posts</span>
          <h3>Recent Threads</h3>
        </div>

        <div class="profile-user-modal-posts-empty">
          <strong>${typeof t === "function" ? t("noThreadsYet") : "No posts yet."}</strong>
          <span>This creator has not posted anything yet.</span>
        </div>
      </section>
    `;
  }

  const postCards = modalThreads
    .map((thread) => {
      const content = escapeHTML(thread.content || "");
      const date = formatDate(thread.created_at);
      const likeCount = getProfileModalPostLikeCount(thread.id, modalLikes);

      const textBlock = content
        ? `<p class="profile-user-modal-post-text">${content}</p>`
        : "";

      const imageBlock = thread.image_url
        ? `
          <div class="profile-user-modal-post-image-wrap">
            <img
              src="${escapeHTML(thread.image_url)}"
              alt="Post image"
              loading="lazy"
            />
          </div>
        `
        : "";

      return `
        <article class="profile-user-modal-post-card">
          ${textBlock}
          ${imageBlock}

          <div class="profile-user-modal-post-meta">
            <span>${escapeHTML(date)}</span>

            <span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12.1 21.35 10.65 20.03C5.4 15.26 2 12.18 2 8.4 2 5.32 4.42 2.9 7.5 2.9c1.74 0 3.41.81 4.5 2.09C13.09 3.71 14.76 2.9 16.5 2.9 19.58 2.9 22 5.32 22 8.4c0 3.78-3.4 6.86-8.65 11.63l-1.25 1.32Z"></path>
              </svg>
              ${likeCount}
            </span>
          </div>
        </article>
      `;
    })
    .join("");

  return `
    <section class="profile-user-modal-posts">
      <div class="profile-user-modal-posts-head">
        <span class="eyebrow">Latest posts</span>
        <h3>Recent Threads</h3>
      </div>

      <div class="profile-user-modal-posts-list">
        ${postCards}
      </div>
    </section>
  `;
}

async function loadProfileUserModal(userId) {
  const profileUserModalBody = document.getElementById("profileUserModalBody");

  if (!profileUserModalBody || !userId) return;

  profileUserModalBody.innerHTML = `<div class="profile-user-modal-state">Loading profile...</div>`;

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("id, full_name, username, email, avatar_url, bio")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    profileUserModalBody.innerHTML = `
      <div class="profile-user-modal-empty error">
        <strong>Could not load profile.</strong>
        <span>${escapeHTML(profileError.message)}</span>
      </div>
    `;
    return;
  }

  if (!profile) {
    profileUserModalBody.innerHTML = `
      <div class="profile-user-modal-empty">
        <strong>Profile not found.</strong>
        <span>This creator profile does not exist anymore.</span>
      </div>
    `;
    return;
  }

  let stats = {
    posts: 0,
    likes: 0,
    followers: 0,
    following: 0
  };

  let modalPostData = {
    threads: [],
    likes: []
  };

  try {
    const [loadedStats, loadedPostData] = await Promise.all([
      getUserProfileStats(userId),
      getProfileModalPosts(userId)
    ]);

    stats = loadedStats;
    modalPostData = loadedPostData;
  } catch (error) {
    profileUserModalBody.innerHTML = `
      <div class="profile-user-modal-empty error">
        <strong>Could not load profile data.</strong>
        <span>${escapeHTML(error.message)}</span>
      </div>
    `;
    return;
  }

  const name = getSafeProfileName(profile, userId);
  const username = getSafeUsername(profile);
  const bio = getSafeBio(profile);
  const avatar = getSafeAvatar(profile, name);
  const isOwnProfile = currentUser && userId === currentUser.id;
  const following = await isCurrentUserFollowing(userId);
  const postsMarkup = renderProfileModalPosts(modalPostData.threads, modalPostData.likes);

  const followButton = isOwnProfile
    ? `
      <button class="btn ghost-btn profile-user-modal-follow-btn" type="button" disabled>
        Your profile
      </button>
    `
    : `
      <button
        id="profileUserModalFollowBtn"
        class="btn ${following ? "ghost-btn" : "primary-btn"} profile-user-modal-follow-btn"
        type="button"
        data-profile-modal-follow-user-id="${escapeHTML(userId)}"
      >
        ${following ? (typeof t === "function" ? t("unfollowed").replace(".", "") : "Unfollow") : (typeof t === "function" ? t("follow") : "Follow")}
      </button>
    `;

  profileUserModalBody.innerHTML = `
    <div class="profile-user-modal-hero">
      <img src="${escapeHTML(avatar)}" alt="${escapeHTML(name)} avatar" />

      <div>
        <span class="eyebrow">Creator profile</span>
        <h2 id="profileUserModalName">${escapeHTML(name)}</h2>
        <p>${escapeHTML(username)}</p>
      </div>
    </div>

    <p class="profile-user-modal-bio">${escapeHTML(bio)}</p>

    <div class="profile-user-modal-stats">
      <div>
        <strong>${stats.posts}</strong>
        <span>Posts</span>
      </div>

      <div>
        <strong>${stats.likes}</strong>
        <span>Likes</span>
      </div>

      <div>
        <strong>${stats.followers}</strong>
        <span>${typeof t === "function" ? t("followers") : "Followers"}</span>
      </div>

      <div>
        <strong>${stats.following}</strong>
        <span>${typeof t === "function" ? t("following") : "Following"}</span>
      </div>
    </div>

    <div class="profile-user-modal-actions">
      ${followButton}
    </div>

    ${postsMarkup}
  `;

  const profileUserModalFollowBtn = document.getElementById("profileUserModalFollowBtn");

  if (profileUserModalFollowBtn) {
    profileUserModalFollowBtn.addEventListener("click", async () => {
      await toggleFollowFromProfileModal(profileUserModalFollowBtn.dataset.profileModalFollowUserId);
    });
  }
}

/* =========================
   FOLLOW STATS
========================= */

async function loadProfileFollowStats() {
  if (!currentUser) {
    profileFollowersCount = 0;
    profileFollowingCount = 0;
    renderProfileStats();
    return;
  }

  const followersRequest = supabaseClient
    .from("thread_follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", currentUser.id);

  const followingRequest = supabaseClient
    .from("thread_follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", currentUser.id);

  const [followersResponse, followingResponse] = await Promise.all([
    followersRequest,
    followingRequest
  ]);

  if (followersResponse.error) {
    setStatus(followersResponse.error.message, "error");
    profileFollowersCount = 0;
    profileFollowingCount = 0;
    renderProfileStats();
    return;
  }

  if (followingResponse.error) {
    setStatus(followingResponse.error.message, "error");
    profileFollowersCount = 0;
    profileFollowingCount = 0;
    renderProfileStats();
    return;
  }

  profileFollowersCount = followersResponse.count || 0;
  profileFollowingCount = followingResponse.count || 0;

  renderProfileStats();
}

/* =========================
   LOAD PROFILE DATA
========================= */

async function loadProfilePageData() {
  if (!currentUser) {
    profileData = null;
    profileThreads = [];
    profileLikes = [];
    profileFollowersCount = 0;
    profileFollowingCount = 0;
    latestUploadedAvatarUrl = null;

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

  const followersRequest = supabaseClient
    .from("thread_follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", currentUser.id);

  const followingRequest = supabaseClient
    .from("thread_follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", currentUser.id);

  const [
    profileResponse,
    threadsResponse,
    likesResponse,
    followersResponse,
    followingResponse
  ] = await Promise.all([
    profileRequest,
    threadsRequest,
    likesRequest,
    followersRequest,
    followingRequest
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

  if (followersResponse.error) {
    setStatus(followersResponse.error.message, "error");
    return;
  }

  if (followingResponse.error) {
    setStatus(followingResponse.error.message, "error");
    return;
  }

  profileData = profileResponse.data || null;
  currentProfile = profileData || currentProfile;
  latestUploadedAvatarUrl = profileData?.avatar_url || latestUploadedAvatarUrl;

  profileThreads = threadsResponse.data || [];
  profileLikes = likesResponse.data || [];
  profileFollowersCount = followersResponse.count || 0;
  profileFollowingCount = followingResponse.count || 0;

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
    setStatus(typeof t === "function" ? t("signIn") : "Sign in first.", "error");
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

  const currentAvatarUrl =
    latestUploadedAvatarUrl ||
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
  latestUploadedAvatarUrl = data.avatar_url || latestUploadedAvatarUrl;

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
    setStatus(typeof t === "function" ? t("signIn") : "Sign in first.", "error");
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
  latestUploadedAvatarUrl = data.avatar_url;

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

  const followingModalBackdrop = document.getElementById("followingModalBackdrop");
  const followersModalBackdrop = document.getElementById("followersModalBackdrop");
  const profileUserModalBackdrop = document.getElementById("profileUserModalBackdrop");

  if (
    !followingModalBackdrop?.classList.contains("active") &&
    !followersModalBackdrop?.classList.contains("active") &&
    !profileUserModalBackdrop?.classList.contains("active")
  ) {
    document.body.style.overflow = "";
  }
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
   PROFILE REALTIME
========================= */

function unsubscribeProfileRealtime() {
  if (profileRealtimeChannel) {
    supabaseClient.removeChannel(profileRealtimeChannel);
    profileRealtimeChannel = null;
  }
}

function subscribeToProfileRealtime() {
  if (!currentUser) return;

  unsubscribeProfileRealtime();

  profileRealtimeChannel = supabaseClient
    .channel(`profile-follow-stats-${currentUser.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "thread_follows"
      },
      async () => {
        await loadProfileFollowStats();

        const followingModalBackdrop = document.getElementById("followingModalBackdrop");
        const followersModalBackdrop = document.getElementById("followersModalBackdrop");

        if (followingModalBackdrop?.classList.contains("active")) {
          await loadProfileFollowingList();
        }

        if (followersModalBackdrop?.classList.contains("active")) {
          await loadProfileFollowersList();
        }

        if (profileViewingModalUserId) {
          await loadProfileUserModal(profileViewingModalUserId);
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "threads"
      },
      async () => {
        await loadProfilePageData();

        if (profileViewingModalUserId) {
          await loadProfileUserModal(profileViewingModalUserId);
        }
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
        await loadProfilePageData();

        if (profileViewingModalUserId) {
          await loadProfileUserModal(profileViewingModalUserId);
        }
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
        await loadProfilePageData();

        const followingModalBackdrop = document.getElementById("followingModalBackdrop");
        const followersModalBackdrop = document.getElementById("followersModalBackdrop");

        if (followingModalBackdrop?.classList.contains("active")) {
          await loadProfileFollowingList();
        }

        if (followersModalBackdrop?.classList.contains("active")) {
          await loadProfileFollowersList();
        }

        if (profileViewingModalUserId) {
          await loadProfileUserModal(profileViewingModalUserId);
        }
      }
    )
    .subscribe();
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
      window.location.href = "/";
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

  setupFollowingModal();
  setupFollowersModal();
  setupProfileUserModal();

  setupFollowingStatButton();
  setupFollowersStatButton();

  setBottomNavActive("profile");

  await restoreSession();
  await loadProfilePageData();

  window.addEventListener("loomyva:language-change", () => {
    renderProfileStats();
    renderProfilePosts();
    if (profileViewingModalUserId) {
      renderProfileUserModal(profileViewingModalUserId);
    }
  });

  subscribeToProfileRealtime();

  listenForAuthChanges({
    onSignedIn: async () => {
      await loadProfilePageData();
      subscribeToProfileRealtime();

      if (typeof initNotificationsSystem === "function") {
        await initNotificationsSystem();
      }
    },
    onSignedOut: async () => {
      profileData = null;
      profileThreads = [];
      profileLikes = [];
      profileFollowersCount = 0;
      profileFollowingCount = 0;
      latestUploadedAvatarUrl = null;
      profileViewingModalUserId = null;

      renderProfileEditor();
      renderProfileStats();
      renderProfilePosts();

      closeFollowingModal();
      closeFollowersModal();
      closeProfileUserModal();

      unsubscribeProfileRealtime();

      if (typeof resetNotificationsSystem === "function") {
        resetNotificationsSystem();
      }

      setBottomNavActive("profile");
    }
  });
}
