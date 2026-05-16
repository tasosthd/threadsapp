let currentUser = null;
let currentProfile = null;

/* =========================
   USER META
========================= */

function getUserMeta(user) {
  const meta = user?.user_metadata || {};
  const username = meta.username ? cleanUsername(meta.username) : "";

  return {
    name: username || meta.full_name || meta.name || "User",
    username,
    email: user?.email || "",
    avatar: meta.avatar_url || meta.picture || fallbackAvatar(username || user?.email || "User")
  };
}

/* =========================
   PROFILE UPSERT
========================= */

async function upsertProfile() {
  if (!currentUser) return;

  const meta = getUserMeta(currentUser);

  const defaultUsername = meta.username
    ? cleanUsername(meta.username)
    : meta.email
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

  const username = existingProfile?.username || defaultUsername;

  /*
    If an older email-created profile saved the email as full_name,
    prefer the username so the sidebar does not show the full email as the main name.
  */
  const existingFullNameLooksLikeEmail =
    existingProfile?.full_name && existingProfile.full_name.includes("@");

  const fullName = existingFullNameLooksLikeEmail
    ? username
    : existingProfile?.full_name || meta.name || username;

  const profilePayload = {
    id: currentUser.id,
    email: meta.email,
    full_name: fullName,
    username,

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
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const emailAuthForm = document.getElementById("emailAuthForm");
  const authDivider = document.querySelector(".auth-divider");

  const userBox = document.getElementById("userBox");
  const userAvatar = document.getElementById("userAvatar");
  const userName = document.getElementById("userName");
  const userEmail = document.getElementById("userEmail");

  if (!userBox) return;

  if (!currentUser) {
    if (loginBtn) {
      loginBtn.classList.remove("hidden");
    }

    if (googleLoginBtn) {
      googleLoginBtn.classList.remove("hidden");
    }

    if (emailAuthForm) {
      emailAuthForm.classList.remove("hidden");
    }

    if (authDivider) {
      authDivider.classList.remove("hidden");
    }

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
    fallbackAvatar(meta.username || meta.email || "User");

  /*
    Main display name should be the username first.
    The email can still appear underneath as account info.
  */
  const name =
    currentProfile?.username ||
    currentProfile?.full_name ||
    meta.username ||
    meta.name ||
    "User";

  const email =
    currentProfile?.email ||
    meta.email ||
    "";

  if (loginBtn) {
    loginBtn.classList.add("hidden");
  }

  if (googleLoginBtn) {
    googleLoginBtn.classList.add("hidden");
  }

  if (emailAuthForm) {
    emailAuthForm.classList.add("hidden");
  }

  if (authDivider) {
    authDivider.classList.add("hidden");
  }

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
   EMAIL AUTH HELPERS
========================= */

function getEmailAuthFields() {
  const emailInput = document.getElementById("authEmail");
  const usernameInput = document.getElementById("authUsername");
  const passwordInput = document.getElementById("authPassword");

  const email = emailInput ? emailInput.value.trim() : "";
  const rawUsername = usernameInput ? usernameInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";

  const username = rawUsername ? cleanUsername(rawUsername) : "";

  return { email, username, password };
}

function validateEmailAuth(email, password) {
  if (!email || !password) {
    setStatus("Please enter your email and password.", "error");
    return false;
  }

  if (!email.includes("@") || !email.includes(".")) {
    setStatus("Please enter a valid email address.", "error");
    return false;
  }

  if (password.length < 6) {
    setStatus("Password must be at least 6 characters.", "error");
    return false;
  }

  return true;
}

function validateSignupUsername(username) {
  if (!username) {
    setStatus("Please choose a username before creating an account.", "error");
    return false;
  }

  if (username.length < 3) {
    setStatus("Username must be at least 3 characters.", "error");
    return false;
  }

  if (username.length > 28) {
    setStatus("Username must be 28 characters or less.", "error");
    return false;
  }

  return true;
}

function setButtonLoading(button, isLoading, loadingText, defaultText) {
  if (!button) return;

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : defaultText;
}

/* =========================
   EMAIL SIGN IN
========================= */

async function signInWithEmailPassword(event) {
  if (event) {
    event.preventDefault();
  }

  setStatus("");

  const { email, password } = getEmailAuthFields();

  if (!validateEmailAuth(email, password)) return;

  const emailLoginBtn = document.getElementById("emailLoginBtn");

  setButtonLoading(emailLoginBtn, true, "Logging in...", "Log in");

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  setButtonLoading(emailLoginBtn, false, "Logging in...", "Log in");

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  currentUser = data.user || null;

  if (currentUser) {
    await upsertProfile();
  }

  setStatus("Logged in successfully.", "success");

  window.location.href = "/profile/";
}

/* =========================
   EMAIL SIGN UP
========================= */

async function signUpWithEmailPassword() {
  setStatus("");

  const { email, username, password } = getEmailAuthFields();

  if (!validateEmailAuth(email, password)) return;
  if (!validateSignupUsername(username)) return;

  const emailSignupBtn = document.getElementById("emailSignupBtn");

  setButtonLoading(emailSignupBtn, true, "Creating account...", "Create account");

  /*
    Check if the username is already taken before creating the auth user.
    This depends on your profiles SELECT policy being public/readable.
  */
  const { data: usernameExists, error: usernameCheckError } = await supabaseClient
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (usernameCheckError) {
    setButtonLoading(emailSignupBtn, false, "Creating account...", "Create account");
    setStatus(usernameCheckError.message, "error");
    return;
  }

  if (usernameExists) {
    setButtonLoading(emailSignupBtn, false, "Creating account...", "Create account");
    setStatus("This username is already taken. Try another one.", "error");
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/profile/`,
      data: {
        username,
        full_name: username,
        name: username
      }
    }
  });

  setButtonLoading(emailSignupBtn, false, "Creating account...", "Create account");

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  currentUser = data.user || null;

  /*
    If email confirmation is OFF, Supabase returns a session and the user can enter immediately.
    If email confirmation is ON, Supabase returns a user but no session, so they must confirm email first.
    The chosen username is saved in user_metadata and will be written to profiles after confirmation/login.
  */
  if (data.session && currentUser) {
    await upsertProfile();
    setStatus("Account created successfully.", "success");
    window.location.href = "/profile/";
    return;
  }

  setStatus("Account created. Check your email to confirm your account, then log in.", "success");
}

/* =========================
   GOOGLE SIGN IN
========================= */

async function signInWithGoogle() {
  setStatus("");

  /*
    Redirect user to profile page after Google login.

    Works for:
    - https://loomyva.com/profile/
    - https://threadsapp-nu.vercel.app/profile/
    - local testing too, if added in Supabase Redirect URLs
  */
  const redirectTo = `${window.location.origin}/profile/`;

  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const loginBtn = document.getElementById("loginBtn");

  setButtonLoading(googleLoginBtn, true, "Opening Google...", "Continue with Google");

  if (loginBtn && loginBtn !== googleLoginBtn) {
    loginBtn.disabled = true;
  }

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo
    }
  });

  setButtonLoading(googleLoginBtn, false, "Opening Google...", "Continue with Google");

  if (loginBtn && loginBtn !== googleLoginBtn) {
    loginBtn.disabled = false;
  }

  if (error) {
    setStatus(error.message, "error");
  }
}

/* =========================
   SIGN OUT
========================= */

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
   PASSWORD VISIBILITY TOGGLE
========================= */

function setupPasswordToggle() {
  const passwordInput = document.getElementById("authPassword");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");

  if (!passwordInput || !togglePasswordBtn) return;

  togglePasswordBtn.addEventListener("click", () => {
    const isVisible = passwordInput.type === "text";

    passwordInput.type = isVisible ? "password" : "text";

    togglePasswordBtn.classList.toggle("is-visible", !isVisible);

    togglePasswordBtn.setAttribute(
      "aria-label",
      isVisible ? "Show password" : "Hide password"
    );
  });
}

/* =========================
   BUTTON SETUP
========================= */

function setupAuthButtons() {
  setupPasswordToggle();

  const loginBtn = document.getElementById("loginBtn");
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  const emailAuthForm = document.getElementById("emailAuthForm");
  const emailLoginBtn = document.getElementById("emailLoginBtn");
  const emailSignupBtn = document.getElementById("emailSignupBtn");

  /*
    Old Google button support:
    If your old HTML still has id="loginBtn",
    this keeps it working as Google login.
  */
  if (loginBtn) {
    loginBtn.addEventListener("click", signInWithGoogle);
  }

  /*
    New Google button:
    Better name for the secondary Google option.
  */
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", signInWithGoogle);
  }

  /*
    Main email/password login form.
    Pressing Enter inside the password field will log in.
  */
  if (emailAuthForm) {
    emailAuthForm.addEventListener("submit", signInWithEmailPassword);
  } else if (emailLoginBtn) {
    emailLoginBtn.addEventListener("click", signInWithEmailPassword);
  }

  if (emailSignupBtn) {
    emailSignupBtn.addEventListener("click", signUpWithEmailPassword);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", signOut);
  }
}
