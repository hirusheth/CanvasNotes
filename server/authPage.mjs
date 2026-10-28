// The sign-in / create-account page, served to signed-out visitors. It is a
// standalone page (no app bundle) and picks the language the app last used on
// this device, falling back to the browser's.

const STRINGS = {
  es: {
    'Sign in': 'Iniciar sesión',
    'Create account': 'Crear cuenta',
    Email: 'Correo electrónico',
    Password: 'Contraseña',
    'Your name (optional)': 'Tu nombre (opcional)',
    'Invite code': 'Código de invitación',
    'Sign in to open your boards.': 'Inicia sesión para abrir tus tableros.',
    'Create an account to start your own boards.': 'Crea una cuenta para empezar tus propios tableros.',
    'New here? Create an account': '¿Eres nuevo? Crea una cuenta',
    'Already have an account? Sign in': '¿Ya tienes cuenta? Inicia sesión',
    'At least 8 characters': 'Al menos 8 caracteres',
    'Sign-ups are closed on this server.': 'El registro está cerrado en este servidor.',
    'Something went wrong. Try again.': 'Algo salió mal. Inténtalo de nuevo.',
    'Wrong email or password.': 'Correo o contraseña incorrectos.',
    'Enter a valid email address.': 'Introduce un correo electrónico válido.',
    'An account with this email already exists. Sign in instead.': 'Ya existe una cuenta con este correo. Inicia sesión.',
    'Too many attempts. Try again in a few minutes.': 'Demasiados intentos. Vuelve a intentarlo en unos minutos.',
    'Too many new accounts from here. Try again later.': 'Demasiadas cuentas nuevas desde aquí. Inténtalo más tarde.',
    'That invite code is not valid.': 'Ese código de invitación no es válido.',
    'Use at least 8 characters for your password.': 'Usa al menos 8 caracteres en tu contraseña.',
    'That password is too long.': 'Esa contraseña es demasiado larga.',
  },
  fr: {
    'Sign in': 'Se connecter',
    'Create account': 'Créer un compte',
    Email: 'E-mail',
    Password: 'Mot de passe',
    'Your name (optional)': 'Votre nom (facultatif)',
    'Invite code': "Code d'invitation",
    'Sign in to open your boards.': 'Connectez-vous pour ouvrir vos tableaux.',
    'Create an account to start your own boards.': 'Créez un compte pour commencer vos propres tableaux.',
    'New here? Create an account': 'Nouveau ? Créez un compte',
    'Already have an account? Sign in': 'Vous avez déjà un compte ? Connectez-vous',
    'At least 8 characters': 'Au moins 8 caractères',
    'Sign-ups are closed on this server.': 'Les inscriptions sont fermées sur ce serveur.',
    'Something went wrong. Try again.': "Une erreur s'est produite. Réessayez.",
    'Wrong email or password.': 'E-mail ou mot de passe incorrect.',
    'Enter a valid email address.': 'Saisissez une adresse e-mail valide.',
    'An account with this email already exists. Sign in instead.': 'Un compte existe déjà avec cet e-mail. Connectez-vous.',
    'Too many attempts. Try again in a few minutes.': 'Trop de tentatives. Réessayez dans quelques minutes.',
    'Too many new accounts from here. Try again later.': "Trop de nouveaux comptes depuis cet endroit. Réessayez plus tard.",
    'That invite code is not valid.': "Ce code d'invitation n'est pas valide.",
    'Use at least 8 characters for your password.': 'Utilisez au moins 8 caractères pour votre mot de passe.',
    'That password is too long.': 'Ce mot de passe est trop long.',
  },
  pt: {
    'Sign in': 'Entrar',
    'Create account': 'Criar conta',
    Email: 'E-mail',
    Password: 'Senha',
    'Your name (optional)': 'Seu nome (opcional)',
    'Invite code': 'Código de convite',
    'Sign in to open your boards.': 'Entre para abrir seus quadros.',
    'Create an account to start your own boards.': 'Crie uma conta para começar seus próprios quadros.',
    'New here? Create an account': 'Novo por aqui? Crie uma conta',
    'Already have an account? Sign in': 'Já tem uma conta? Entre',
    'At least 8 characters': 'Pelo menos 8 caracteres',
    'Sign-ups are closed on this server.': 'Os cadastros estão fechados neste servidor.',
    'Something went wrong. Try again.': 'Algo deu errado. Tente novamente.',
    'Wrong email or password.': 'E-mail ou senha incorretos.',
    'Enter a valid email address.': 'Digite um e-mail válido.',
    'An account with this email already exists. Sign in instead.': 'Já existe uma conta com este e-mail. Entre.',
    'Too many attempts. Try again in a few minutes.': 'Muitas tentativas. Tente novamente em alguns minutos.',
    'Too many new accounts from here. Try again later.': 'Muitas contas novas daqui. Tente mais tarde.',
    'That invite code is not valid.': 'Esse código de convite não é válido.',
    'Use at least 8 characters for your password.': 'Use pelo menos 8 caracteres na sua senha.',
    'That password is too long.': 'Essa senha é longa demais.',
  },
  de: {
    'Sign in': 'Anmelden',
    'Create account': 'Konto erstellen',
    Email: 'E-Mail',
    Password: 'Passwort',
    'Your name (optional)': 'Dein Name (optional)',
    'Invite code': 'Einladungscode',
    'Sign in to open your boards.': 'Melde dich an, um deine Boards zu öffnen.',
    'Create an account to start your own boards.': 'Erstelle ein Konto, um eigene Boards anzulegen.',
    'New here? Create an account': 'Neu hier? Konto erstellen',
    'Already have an account? Sign in': 'Schon ein Konto? Anmelden',
    'At least 8 characters': 'Mindestens 8 Zeichen',
    'Sign-ups are closed on this server.': 'Registrierungen sind auf diesem Server geschlossen.',
    'Something went wrong. Try again.': 'Etwas ist schiefgelaufen. Versuche es erneut.',
    'Wrong email or password.': 'Falsche E-Mail oder falsches Passwort.',
    'Enter a valid email address.': 'Gib eine gültige E-Mail-Adresse ein.',
    'An account with this email already exists. Sign in instead.': 'Mit dieser E-Mail gibt es bereits ein Konto. Melde dich an.',
    'Too many attempts. Try again in a few minutes.': 'Zu viele Versuche. Versuche es in ein paar Minuten erneut.',
    'Too many new accounts from here. Try again later.': 'Zu viele neue Konten von hier. Versuche es später erneut.',
    'That invite code is not valid.': 'Dieser Einladungscode ist ungültig.',
    'Use at least 8 characters for your password.': 'Verwende mindestens 8 Zeichen für dein Passwort.',
    'That password is too long.': 'Dieses Passwort ist zu lang.',
  },
  it: {
    'Sign in': 'Accedi',
    'Create account': 'Crea account',
    Email: 'Email',
    Password: 'Password',
    'Your name (optional)': 'Il tuo nome (facoltativo)',
    'Invite code': 'Codice di invito',
    'Sign in to open your boards.': 'Accedi per aprire le tue bacheche.',
    'Create an account to start your own boards.': 'Crea un account per iniziare le tue bacheche.',
    'New here? Create an account': 'Sei nuovo? Crea un account',
    'Already have an account? Sign in': 'Hai già un account? Accedi',
    'At least 8 characters': 'Almeno 8 caratteri',
    'Sign-ups are closed on this server.': 'Le registrazioni sono chiuse su questo server.',
    'Something went wrong. Try again.': 'Qualcosa è andato storto. Riprova.',
    'Wrong email or password.': 'Email o password errate.',
    'Enter a valid email address.': 'Inserisci un indirizzo email valido.',
    'An account with this email already exists. Sign in instead.': 'Esiste già un account con questa email. Accedi.',
    'Too many attempts. Try again in a few minutes.': 'Troppi tentativi. Riprova tra qualche minuto.',
    'Too many new accounts from here. Try again later.': 'Troppi nuovi account da qui. Riprova più tardi.',
    'That invite code is not valid.': 'Questo codice di invito non è valido.',
    'Use at least 8 characters for your password.': 'Usa almeno 8 caratteri per la password.',
    'That password is too long.': 'Questa password è troppo lunga.',
  },
  nl: {
    'Sign in': 'Inloggen',
    'Create account': 'Account aanmaken',
    Email: 'E-mail',
    Password: 'Wachtwoord',
    'Your name (optional)': 'Je naam (optioneel)',
    'Invite code': 'Uitnodigingscode',
    'Sign in to open your boards.': 'Log in om je borden te openen.',
    'Create an account to start your own boards.': 'Maak een account aan om je eigen borden te beginnen.',
    'New here? Create an account': 'Nieuw hier? Maak een account aan',
    'Already have an account? Sign in': 'Heb je al een account? Log in',
    'At least 8 characters': 'Minstens 8 tekens',
    'Sign-ups are closed on this server.': 'Aanmelden is gesloten op deze server.',
    'Something went wrong. Try again.': 'Er ging iets mis. Probeer het opnieuw.',
    'Wrong email or password.': 'Onjuist e-mailadres of wachtwoord.',
    'Enter a valid email address.': 'Voer een geldig e-mailadres in.',
    'An account with this email already exists. Sign in instead.': 'Er bestaat al een account met dit e-mailadres. Log in.',
    'Too many attempts. Try again in a few minutes.': 'Te veel pogingen. Probeer het over een paar minuten opnieuw.',
    'Too many new accounts from here. Try again later.': 'Te veel nieuwe accounts vanaf hier. Probeer het later opnieuw.',
    'That invite code is not valid.': 'Deze uitnodigingscode is ongeldig.',
    'Use at least 8 characters for your password.': 'Gebruik minstens 8 tekens voor je wachtwoord.',
    'That password is too long.': 'Dat wachtwoord is te lang.',
  },
  pl: {
    'Sign in': 'Zaloguj się',
    'Create account': 'Utwórz konto',
    Email: 'E-mail',
    Password: 'Hasło',
    'Your name (optional)': 'Twoje imię (opcjonalnie)',
    'Invite code': 'Kod zaproszenia',
    'Sign in to open your boards.': 'Zaloguj się, aby otworzyć swoje tablice.',
    'Create an account to start your own boards.': 'Utwórz konto, aby zacząć własne tablice.',
    'New here? Create an account': 'Jesteś tu nowy? Utwórz konto',
    'Already have an account? Sign in': 'Masz już konto? Zaloguj się',
    'At least 8 characters': 'Co najmniej 8 znaków',
    'Sign-ups are closed on this server.': 'Rejestracja na tym serwerze jest zamknięta.',
    'Something went wrong. Try again.': 'Coś poszło nie tak. Spróbuj ponownie.',
    'Wrong email or password.': 'Nieprawidłowy e-mail lub hasło.',
    'Enter a valid email address.': 'Podaj prawidłowy adres e-mail.',
    'An account with this email already exists. Sign in instead.': 'Konto z tym adresem e-mail już istnieje. Zaloguj się.',
    'Too many attempts. Try again in a few minutes.': 'Zbyt wiele prób. Spróbuj ponownie za kilka minut.',
    'Too many new accounts from here. Try again later.': 'Zbyt wiele nowych kont z tego miejsca. Spróbuj później.',
    'That invite code is not valid.': 'Ten kod zaproszenia jest nieprawidłowy.',
    'Use at least 8 characters for your password.': 'Hasło musi mieć co najmniej 8 znaków.',
    'That password is too long.': 'To hasło jest za długie.',
  },
  ru: {
    'Sign in': 'Войти',
    'Create account': 'Создать аккаунт',
    Email: 'Эл. почта',
    Password: 'Пароль',
    'Your name (optional)': 'Ваше имя (необязательно)',
    'Invite code': 'Код приглашения',
    'Sign in to open your boards.': 'Войдите, чтобы открыть свои доски.',
    'Create an account to start your own boards.': 'Создайте аккаунт, чтобы начать свои доски.',
    'New here? Create an account': 'Впервые здесь? Создайте аккаунт',
    'Already have an account? Sign in': 'Уже есть аккаунт? Войдите',
    'At least 8 characters': 'Не менее 8 символов',
    'Sign-ups are closed on this server.': 'Регистрация на этом сервере закрыта.',
    'Something went wrong. Try again.': 'Что-то пошло не так. Попробуйте ещё раз.',
    'Wrong email or password.': 'Неверная почта или пароль.',
    'Enter a valid email address.': 'Введите корректный адрес почты.',
    'An account with this email already exists. Sign in instead.': 'Аккаунт с этой почтой уже существует. Войдите.',
    'Too many attempts. Try again in a few minutes.': 'Слишком много попыток. Повторите через несколько минут.',
    'Too many new accounts from here. Try again later.': 'Слишком много новых аккаунтов отсюда. Попробуйте позже.',
    'That invite code is not valid.': 'Этот код приглашения недействителен.',
    'Use at least 8 characters for your password.': 'Пароль должен содержать не менее 8 символов.',
    'That password is too long.': 'Этот пароль слишком длинный.',
  },
  ja: {
    'Sign in': 'ログイン',
    'Create account': 'アカウント作成',
    Email: 'メールアドレス',
    Password: 'パスワード',
    'Your name (optional)': 'お名前(任意)',
    'Invite code': '招待コード',
    'Sign in to open your boards.': 'ログインしてボードを開きます。',
    'Create an account to start your own boards.': 'アカウントを作成して自分のボードを始めましょう。',
    'New here? Create an account': '初めてですか?アカウントを作成',
    'Already have an account? Sign in': 'アカウントをお持ちですか?ログイン',
    'At least 8 characters': '8文字以上',
    'Sign-ups are closed on this server.': 'このサーバーでは新規登録を受け付けていません。',
    'Something went wrong. Try again.': '問題が発生しました。もう一度お試しください。',
    'Wrong email or password.': 'メールアドレスまたはパスワードが違います。',
    'Enter a valid email address.': '有効なメールアドレスを入力してください。',
    'An account with this email already exists. Sign in instead.': 'このメールアドレスのアカウントは既にあります。ログインしてください。',
    'Too many attempts. Try again in a few minutes.': '試行回数が多すぎます。数分後にもう一度お試しください。',
    'Too many new accounts from here. Try again later.': 'ここからの新規アカウントが多すぎます。後でもう一度お試しください。',
    'That invite code is not valid.': 'その招待コードは無効です。',
    'Use at least 8 characters for your password.': 'パスワードは8文字以上にしてください。',
    'That password is too long.': 'パスワードが長すぎます。',
  },
  zh: {
    'Sign in': '登录',
    'Create account': '创建账户',
    Email: '电子邮箱',
    Password: '密码',
    'Your name (optional)': '你的名字(可选)',
    'Invite code': '邀请码',
    'Sign in to open your boards.': '登录以打开你的看板。',
    'Create an account to start your own boards.': '创建账户,开始你自己的看板。',
    'New here? Create an account': '新用户?创建账户',
    'Already have an account? Sign in': '已有账户?登录',
    'At least 8 characters': '至少 8 个字符',
    'Sign-ups are closed on this server.': '此服务器已关闭注册。',
    'Something went wrong. Try again.': '出了点问题,请重试。',
    'Wrong email or password.': '邮箱或密码错误。',
    'Enter a valid email address.': '请输入有效的邮箱地址。',
    'An account with this email already exists. Sign in instead.': '该邮箱已有账户,请直接登录。',
    'Too many attempts. Try again in a few minutes.': '尝试次数过多,请几分钟后再试。',
    'Too many new accounts from here. Try again later.': '此处新建账户过多,请稍后再试。',
    'That invite code is not valid.': '该邀请码无效。',
    'Use at least 8 characters for your password.': '密码至少需要 8 个字符。',
    'That password is too long.': '密码太长。',
  },
  ko: {
    'Sign in': '로그인',
    'Create account': '계정 만들기',
    Email: '이메일',
    Password: '비밀번호',
    'Your name (optional)': '이름(선택)',
    'Invite code': '초대 코드',
    'Sign in to open your boards.': '로그인하여 보드를 여세요.',
    'Create an account to start your own boards.': '계정을 만들어 나만의 보드를 시작하세요.',
    'New here? Create an account': '처음이신가요? 계정 만들기',
    'Already have an account? Sign in': '이미 계정이 있나요? 로그인',
    'At least 8 characters': '8자 이상',
    'Sign-ups are closed on this server.': '이 서버는 가입을 받지 않습니다.',
    'Something went wrong. Try again.': '문제가 발생했습니다. 다시 시도하세요.',
    'Wrong email or password.': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'Enter a valid email address.': '올바른 이메일 주소를 입력하세요.',
    'An account with this email already exists. Sign in instead.': '이 이메일로 된 계정이 이미 있습니다. 로그인하세요.',
    'Too many attempts. Try again in a few minutes.': '시도 횟수가 너무 많습니다. 몇 분 후 다시 시도하세요.',
    'Too many new accounts from here. Try again later.': '이곳에서 새 계정이 너무 많이 만들어졌습니다. 나중에 다시 시도하세요.',
    'That invite code is not valid.': '유효하지 않은 초대 코드입니다.',
    'Use at least 8 characters for your password.': '비밀번호는 8자 이상이어야 합니다.',
    'That password is too long.': '비밀번호가 너무 깁니다.',
  },
};

// `<` is escaped so the JSON can't close the script tag it sits in.
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

export function authPage({ open, invite, nonce }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>Canvas Notes · Sign in</title>
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon-192.png">
<style>
:root{--bg:#eeece8;--card:#fff;--text:#24262b;--muted:#6b7079;--accent:#3a7bd5;--danger:#d6455d}
@media (prefers-color-scheme:dark){:root{--bg:#1b1c1f;--card:#2a2c31;--text:#e7e8ea;--muted:#a8acb4;--accent:#6aa3f0}}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
form{background:var(--card);padding:28px;border-radius:14px;width:min(380px,100%);box-shadow:0 10px 30px rgba(0,0,0,.12)}
h1{font-size:20px;margin:12px 0 4px}p{margin:0 0 18px;color:var(--muted)}
label{display:block;font-size:13px;color:var(--muted);margin:0 0 4px}
input{width:100%;font:inherit;font-size:16px;padding:11px 12px;border-radius:8px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;margin-bottom:12px}
input:focus{outline:2px solid var(--accent);outline-offset:-1px}
button{width:100%;font:inherit;font-weight:600;padding:12px;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer}
button:disabled{opacity:.6;cursor:default}
.switch{display:block;margin-top:12px;text-align:center;background:none;color:var(--accent);font-weight:500;padding:6px;min-height:44px}
.err{color:var(--danger);min-height:1.5em;margin:4px 0 0;font-size:14px}
[hidden]{display:none!important}
</style></head><body>
<form id="f" novalidate><svg viewBox="0 0 32 32" width="40" height="40" aria-hidden="true"><rect x="3" y="5" width="12" height="16" rx="2.5" fill="#f4c95d"/><rect x="17" y="9" width="12" height="18" rx="2.5" fill="#61a5c2"/></svg>
<h1 id="h">Canvas Notes</h1><p id="lead" data-t="Sign in to open your boards.">Sign in to open your boards.</p>
<div id="nameRow" hidden><label for="name" data-t="Your name (optional)">Your name (optional)</label><input id="name" name="name" autocomplete="name" maxlength="80"></div>
<label for="email" data-t="Email">Email</label><input id="email" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" required autofocus>
<label for="password" data-t="Password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<div id="inviteRow" hidden><label for="invite" data-t="Invite code">Invite code</label><input id="invite" name="invite" autocomplete="off"></div>
<button id="submit" data-t="Sign in">Sign in</button><div class="err" id="e" role="alert"></div>
<button type="button" class="switch" id="switch" data-t="New here? Create an account">New here? Create an account</button>
<p id="closed" class="err" hidden data-t="Sign-ups are closed on this server.">Sign-ups are closed on this server.</p>
</form>
<script nonce="${nonce}">
const S=${json(STRINGS)},OPEN=${json(!!open)},INVITE=${json(!!invite)};
let lang='en';try{lang=localStorage.getItem('cn:lang')||''}catch(e){}
if(!S[lang])lang=(navigator.language||'en').slice(0,2);
const t=(s)=>(S[lang]&&S[lang][s])||s;
document.documentElement.lang=S[lang]?lang:'en';
const $=(id)=>document.getElementById(id);
let mode=location.hash==='#signup'&&OPEN?'signup':'signin';
function render(){
  const up=mode==='signup';
  $('nameRow').hidden=!up;$('inviteRow').hidden=!(up&&INVITE);
  $('password').autocomplete=up?'new-password':'current-password';
  $('password').placeholder=up?t('At least 8 characters'):'';
  $('lead').dataset.t=up?'Create an account to start your own boards.':'Sign in to open your boards.';
  $('submit').dataset.t=up?'Create account':'Sign in';
  $('switch').dataset.t=up?'Already have an account? Sign in':'New here? Create an account';
  $('switch').hidden=!OPEN&&!up;$('closed').hidden=OPEN;
  document.title='Canvas Notes · '+t(up?'Create account':'Sign in');
  for(const el of document.querySelectorAll('[data-t]'))el.textContent=t(el.dataset.t);
  $('e').textContent='';
}
$('switch').onclick=()=>{mode=mode==='signup'?'signin':'signup';history.replaceState(null,'',mode==='signup'?'#signup':location.pathname);render();};
$('f').onsubmit=async(ev)=>{ev.preventDefault();const b=$('submit');if(b.disabled)return;b.disabled=true;$('e').textContent='';
  const body={email:$('email').value,password:$('password').value};
  if(mode==='signup'){body.name=$('name').value;body.invite=$('invite').value;}
  try{const r=await fetch(mode==='signup'?'/api/signup':'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    if(r.ok){if(location.hash==='#signup')history.replaceState(null,'',location.pathname+location.search);location.reload();return;}
    const d=await r.json().catch(()=>({}));$('e').textContent=t(d.error||'Something went wrong. Try again.');
  }catch(e){$('e').textContent=t('Something went wrong. Try again.');}
  b.disabled=false;};
render();
</script></body></html>`;
}
