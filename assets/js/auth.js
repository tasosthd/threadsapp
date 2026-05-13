let currentUser = null;
let currentProfile = null;

function getUserMeta(user) {
  const meta = user?.user_metadata || {};

  return {
    name: meta.full_name || meta.name || user?.email || "User",
    email: user?.email || "",
    avatar: meta.avatar_url || meta.picture || fallbackAvatar(user?.email || "User")
  };
}

async function signInWithGoogle() {
  setStatus("Opening Google login...");

  const redirectTo = window.location.origin + window.location.pathname;

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo
    }
  });

  if (error) {
    setStatus(error.message, "error");
  }
}

async function signOut() {
  setStatus("Logging out...");

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  currentUser = null;
  currentProfile = null;

  updateSharedAuthUI();
  setStatus("Logged out.");

  const pageName = getPageName();

  if (pageName === "profile") {
    setTimeout(() => {
      window.location.href = "index.html";
    }, 600);
  }
}

async function upsertProfile() {
  if (!currentUser) return null;

  const meta = getUserMeta(currentUser);

  const defaultUsername = meta.email
    ? cleanUsername(meta.email.split("@")[0])
    : `user_${currentUser.id.slice(0, 8)}`;

  const { data: existingProfile, error: selectError } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (selectError) {
    setStatus(selectError.message, "error");
    return null;
  }

  const profilePayload = {
    id: currentUser.id,
    email: meta.email,
    full_name: meta.name,
    username: existingProfile?.username || defaultUsername,
    avatar_url: meta.avatar,
    bio: existingProfile?.bio || "",
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseClient
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    setStatus(error.message, "error");
    return null;
  }

  currentProfile = data;
  updateSharedAuthUI();

  return data;
}

async function restoreSession() {
  setStatus("Checking session...");

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    setStatus(error.message, "error");
    return null;
  }

  currentUser = data.session?.user || null;

  if (currentUser) {
    await upsertProfile();
    setStatus("Session restored 🚀", "success");
  } else {
    currentProfile = null;
    setStatus("");
  }

  updateSharedAuthUI();

  return currentUser;
}

function updateSharedAuthUI() {
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const userBox = document.getElementById("userBox");
  const userAvatar = document.getElementById("userAvatar");
  const userName = document.getElementById("userName");
  const userEmail = document.getElementById("userEmail");

  const lockedProfileCard = document.getElementById("lockedProfileCard");
  const profileCard = document.getElementById("profileCard");

  if (!currentUser) {
    if (loginBtn) loginBtn.classList.remove("hidden");
    if (userBox) userBox.classList.add("hidden");

    if (profileCard) profileCard.classList.add("hidden");
    if (lockedProfileCard) lockedProfileCard.classList.remove("hidden");

    return;
  }

  const meta = getUserMeta(currentUser);

  if (loginBtn) loginBtn.classList.add("hidden");
  if (userBox) userBox.classList.remove("hidden");

  if (userAvatar) userAvatar.src = currentProfile?.avatar_url || meta.avatar;
  if (userName) userName.textContent = currentProfile?.full_name || meta.name;
  if (userEmail) userEmail.textContent = currentProfile?.email || meta.email;

  if (profileCard) profileCard.classList.remove("hidden");
  if (lockedProfileCard) lockedProfileCard.classList.add("hidden");
}

function setupAuthButtons() {
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (loginBtn) {
    loginBtn.addEventListener("click", signInWithGoogle);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", signOut);
  }
}

function listenForAuthChanges({ onSignedIn, onSignedOut } = {}) {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;

    setTimeout(async () => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (currentUser) {
          await upsertProfile();

          if (typeof onSignedIn === "function") {
            await onSignedIn(currentUser);
          }
        }
      }

      if (event === "SIGNED_OUT") {
        currentProfile = null;
        updateSharedAuthUI();

        if (typeof onSignedOut === "function") {
          await onSignedOut();
        }
      }
    }, 0);
  });
}
