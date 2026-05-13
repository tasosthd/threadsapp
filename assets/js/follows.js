let follows = [];

async function loadFollows() {
  const { data, error } = await supabaseClient
    .from("thread_follows")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  follows = data || [];
}

function isFollowingUser(userId) {
  if (!currentUser) return false;

  return follows.some((follow) => {
    return follow.follower_id === currentUser.id && follow.following_id === userId;
  });
}

function getFollowerCount(userId) {
  return follows.filter((follow) => follow.following_id === userId).length;
}

function getFollowingCount(userId) {
  return follows.filter((follow) => follow.follower_id === userId).length;
}

function getFollowingIdsForCurrentUser() {
  if (!currentUser) return [];

  return follows
    .filter((follow) => follow.follower_id === currentUser.id)
    .map((follow) => follow.following_id);
}

async function toggleFollowUser(userId) {
  if (!currentUser) {
    setStatus("Sign in first to follow users.", "error");
    signInWithGoogle();
    return;
  }

  if (!userId) {
    setStatus("User not found.", "error");
    return;
  }

  if (userId === currentUser.id) {
    setStatus("You cannot follow yourself, CEO 😄", "error");
    return;
  }

  const alreadyFollowing = isFollowingUser(userId);

  if (alreadyFollowing) {
    const { error } = await supabaseClient
      .from("thread_follows")
      .delete()
      .eq("follower_id", currentUser.id)
      .eq("following_id", userId);

    if (error) {
      setStatus(error.message, "error");
      return;
    }

    setStatus("Unfollowed.");
  } else {
    const { error } = await supabaseClient
      .from("thread_follows")
      .insert({
        follower_id: currentUser.id,
        following_id: userId
      });

    if (error) {
      setStatus(error.message, "error");
      return;
    }

    setStatus("Followed 🚀", "success");
  }

  await loadFollows();

  if (typeof updatePublicProfileUI === "function") {
    updatePublicProfileUI();
  }

  if (typeof renderThreads === "function") {
    renderThreads();
  }
}

function bindFollowButtons() {
  document.querySelectorAll("[data-follow-user-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = button.dataset.followUserId;
      await toggleFollowUser(userId);
    });
  });
}
