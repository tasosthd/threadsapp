let currentUser = null;
let currentProfile = null;

/* =========================
   USER META
========================= */

function getUserMeta(user) {
  const meta = user?.user_metadata || {};

  return {
    name: meta.full_name || meta.name || user?.email || "User",
    email: user?.email || "",
    avatar: meta.avatar_url || meta.picture || fallbackAvatar(user?.email || "User")
  };
}

/* =========================
   PROFILE UPSERT
========================= */

async function upsertProfile() {
  if (!currentUser) return;

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
    return;
  }

  const profilePayload = {
    id: currentUser.id,
    email: meta.email,
    full_name: meta.name,
    username: existingProfile?.username || defaultUsername,

    /* 
      Important:
      Keep custom uploaded avatar if it exists.
      Only use Google avatar if the user has never uploaded one.
    */
    avatar_url: existingProfile?.avatar_url || meta.avatar,

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
    return;
  }

  currentProfile = data;

  updateSharedAuthUI();
}

/* =========================
   AUTH UI
========================= */

function updateSharedAuthUI() {
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const userBox = document.getElementById("userBox");
  const userAvatar = document.getElementById("userAvatar");
  const userName = document.getElementById("userName");
  const userEmail = document.getElementById("userEmail");

  if (!loginBtn || !userBox) return;

  if (!currentUser) {
    loginBtn.classList.remove("hidden");
    userBox.classList.add("hidden");

    if (userAvatar) {
      userAvatar.src = "";
    }

    if (userName) {
      userName.textContent = "User";
    }

    if (userEmail) {
      userEmail.textContent = "email";
    }

    if (logoutBtn) {
      logoutBtn.disabled = false;
    }

    return;
  }

  const meta = getUserMeta(currentUser);

  const avatar =
    currentProfile?.avatar_url ||
    meta.avatar ||
    fallbackAvatar(meta.email || "User");

  const name =
    currentProfile?.full_name ||
    meta.name ||
    "User";

  const email =
    currentProfile?.email ||
    meta.email ||
    "";

  loginBtn.classList.add("hidden");
  userBox.classList.remove("hidden");

  if (userAvatar) {
    userAvatar.src = avatar;
  }

  if (userName) {
    userName.textContent = name;
  }

  if (userEmail) {
    userEmail.textContent = email;
  }

  if (logoutBtn) {
    logoutBtn.disabled = false;
  }
}

/* =========================
   SIGN IN / SIGN OUT
========================= */

async function signInWithGoogle() {
  setStatus("");

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
  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {
    logoutBtn.disabled = true;
  }

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    setStatus(error.message, "error");

    if (logoutBtn) {
      logoutBtn.disabled = false;
    }

    return;
  }

  currentUser = null;
  currentProfile = null;

  updateSharedAuthUI();

  if (typeof closeSidebar === "function") {
    closeSidebar();
  }

  setStatus("");
}

/* =========================
   RESTORE SESSION
========================= */

async function restoreSession() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    setStatus(error.message, "error");
    updateSharedAuthUI();
    return;
  }

  currentUser = data.session?.user || null;

  if (currentUser) {
    await upsertProfile();
  } else {
    currentProfile = null;
    updateSharedAuthUI();
  }

  setStatus("");
}

/* =========================
   AUTH LISTENER
========================= */

function listenForAuthChanges({ onSignedIn, onSignedOut } = {}) {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    setTimeout(async () => {
      currentUser = session?.user || null;

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (currentUser) {
          await upsertProfile();
        }

        updateSharedAuthUI();

        if (typeof onSignedIn === "function") {
          await onSignedIn();
        }
      }

      if (event === "SIGNED_OUT") {
        currentUser = null;
        currentProfile = null;

        updateSharedAuthUI();

        if (typeof onSignedOut === "function") {
          await onSignedOut();
        }
      }
    }, 0);
  });
}

/* =========================
   BUTTON SETUP
========================= */

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