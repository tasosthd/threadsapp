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
    setStatus(typeof t === "function" ? t("signIn") : "Sign in first to follow users.", "error");
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

  if (typeof canInteractWithUser === "function" && !canInteractWithUser(userId)) {
    setStatus("You cannot follow or interact with a blocked user.", "error");
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

    follows = follows.filter((follow) => !(follow.follower_id === currentUser.id && follow.following_id === userId));
    setStatus(typeof t === "function" ? t("unfollowed") : "Unfollowed.");
  } else {
    const { data, error } = await supabaseClient
      .from("thread_follows")
      .insert({
        follower_id: currentUser.id,
        following_id: userId
      })
      .select()
      .single();

    if (error) {
      setStatus(error.message, "error");
      return;
    }

    if (data) {
      follows = [data, ...follows];
    } else {
      follows = [{ id: `local-${Date.now()}`, follower_id: currentUser.id, following_id: userId, created_at: new Date().toISOString() }, ...follows];
    }

    if (typeof createFollowNotification === "function") {
      await createFollowNotification(userId);
    }

    setStatus(typeof t === "function" ? t("followed") : "Followed 🚀", "success");
  }

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
