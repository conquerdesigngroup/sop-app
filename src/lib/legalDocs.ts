/**
 * The words of the Privacy Policy and the Terms of Use.
 *
 * EVERY SENTENCE HERE IS A CLAIM ABOUT THE CODE
 *
 * A privacy policy that describes the app the studio meant to build, rather
 * than the one it runs, is worse than none. Each statement below was checked
 * against the migrations and the pages when it was written, and the comments
 * name where. If you change what the app collects or who can see it — a new
 * table, a new RLS rule, a new provider — change the matching sentence here in
 * the same PR, and bump LEGAL_VERSION in legal.ts.
 *
 * Only LegalPage imports this file; see legal.ts for why.
 */

import { LegalBlock, LegalDoc, LegalInline, LEGAL_PATHS, STUDIO_LEGAL } from './legal';

const p = (...parts: LegalInline[]): LegalBlock => ({ kind: 'p', parts });

/** Each item is one string, or an array of runs when it holds a link. */
const list = (...items: (LegalInline | LegalInline[])[]): LegalBlock => ({
  kind: 'list',
  items: items.map(item => (Array.isArray(item) ? item : [item])),
});

const link = (text: string, href: string): LegalInline => ({ text, href });

const email = link(STUDIO_LEGAL.contactEmail, `mailto:${STUDIO_LEGAL.contactEmail}`);
const privacyLink = link('Privacy Policy', LEGAL_PATHS.privacy);
const termsLink = link('Terms of Use', LEGAL_PATHS.terms);
/** The studio contract as app content (ProgramPolicies), readable signed out. */
const studioRulesLink = link('Studio Rules & Policies', '/portal/policies');

export const PRIVACY_POLICY: LegalDoc = {
  id: 'privacy',
  title: 'Privacy Policy',
  intro: [
    `This policy explains what information ${STUDIO_LEGAL.name} (“${STUDIO_LEGAL.shortName}”, “the studio”, “we”) collects through ${STUDIO_LEGAL.site} — the Parent Portal families use and the tools our staff use — how we use it, who can see it, and the choices you have. Enrollment, tuition and billing happen in Enrollio, which has its own privacy policy.`,
  ],
  sections: [
    {
      id: 'short-version',
      heading: 'The short version',
      blocks: [
        list(
          'We collect what the studio needs to teach your dancer and keep you informed: names, email addresses, dates of birth, classes and attendance.',
          'We don’t sell your information or use it for advertising. The app has no ad trackers and no analytics services.',
          'Class photos, videos and files are shared with other signed-in studio families, not only your dancer’s class. “Who can see it” below explains exactly who.',
          'Notifications stay off until you turn them on, and you choose which kinds you get.',
          ['You can ask to see, correct or delete your family’s information by emailing ', email, '.'],
        ),
      ],
    },
    {
      id: 'what-we-collect',
      heading: 'What we collect',
      blocks: [
        // portal_households / portal_students / enrollments (v33, v49), filled
        // from Enrollio's CSV exports through Client Accounts.
        p('From the studio’s enrollment records. When your family enrolls, the studio brings these details over from Enrollio so the portal knows who you are:'),
        list(
          'the parent or guardian’s name and email address, and your family’s Enrollio account number;',
          'each dancer’s first and last name, nickname, date of birth, and the classes they are enrolled in.',
        ),
        // portal-signup creates the account; GoTrue stores the password hashed.
        p('When you create an account: your name, the email address you sign in with, and your password. Passwords are stored only in scrambled (hashed) form, so nobody at the studio can see yours.'),
        // portal_attendance and its append-only history (v52).
        p('Attendance. Teachers record whether each dancer was present, absent, excused, late or out sick, and the app keeps a history of changes to those records.'),
        // push preferences (v42/v51) and portal_avatar_prefs (v53).
        p('What you choose in the app: your notification settings, and the avatar and nickname on your profile.'),
        p('Collected automatically when you use the app:'),
        list(
          // activity_logs with ip_address and user_agent on every write (v43).
          'sign-ins, sign-outs, failed sign-in attempts and changes to your account, with the time, your IP address and your browser and device type;',
          // portal_log_download (v43): file, class, IP, user agent, cf-ipcountry.
          'when a class file is opened or saved: which file, when, and the IP address, browser type and approximate country it came from;',
          // portal_signup_attempts (v28), pruned after 24 hours by portal-signup.
          'sign-up attempts, with the email address and IP address used, kept for about a day to stop abuse;',
          // push_subscriptions (v38): endpoint, keys, user agent.
          'if you turn on notifications, the address your phone or browser gives us for delivering them, and your device type;',
          // portal_install_stats (v32): day, display mode, platform, count. No identity.
          'a daily count of visits by kind of device (the installed app or a browser; iPhone, Android or computer), which is not linked to you or your account.',
        ),
        // work_hours, employee_pay_rates (super admins only, v13), job_tasks, staff-photos (v53).
        p('Staff. For studio employees the app also holds their role, work hours, pay rate (visible only to the studio’s senior administrators), assigned tasks and, if they add one, a staff photo.'),
      ],
    },
    {
      id: 'how-we-use-it',
      heading: 'How we use it',
      blocks: [
        list(
          'To run classes and the portal: showing your family’s schedule, classes, attendance, notices and files.',
          'To send the notifications you have turned on.',
          'To email you sign-in codes and password-reset links.',
          'To keep accounts secure: limiting repeated attempts, spotting misuse, and keeping a record of sign-ins and changes.',
          'For staff: scheduling, tasks, timekeeping and payroll.',
        ),
        p('We don’t sell personal information, share it for advertising, or use it to build profiles about you.'),
      ],
    },
    {
      id: 'who-can-see-it',
      heading: 'Who can see it',
      blocks: [
        list(
          // v33 household policies; v51 student logins; v36 family notes.
          'Your family. A parent or guardian account sees its own household: your dancers, their classes and attendance, and notes the studio sends to your family. A dancer’s own login sees that dancer’s classes and attendance, and the notes sent to their family.',
          // v30 then v55: posted content is readable by any signed-in account,
          // except All-Star content, which is readable only by All-Star families.
          'Other families. Class schedules, notices, photos, videos and files can be seen by other signed-in families, not only families in that class. Anything posted for the All-Star competition program can be seen only by All-Star families; everything else can be seen by any signed-in family. Notes the studio sends to one family are seen only by that family.',
          // v52 teacher grants; v10 staff read of profiles; admins read all (v33).
          'Studio staff. Teachers see the dancers in the classes they teach, including their attendance and date of birth. Staff can see the names and email addresses of portal account holders. The studio’s administrators can see all family and dancer records.',
          'Nobody else, apart from the service providers below, who handle information on our behalf, and anyone the law requires us to disclose it to.',
        ),
      ],
    },
    {
      id: 'service-providers',
      heading: 'Companies that help run the app',
      blocks: [
        p('We use a small number of service providers. They handle information only to provide their service to us:'),
        list(
          // Supabase project in us-west-2.
          'Supabase stores the app’s data and files and runs sign-in. Your information is stored in the United States.',
          'Vercel hosts the app’s website.',
          // Cloudflare Stream (portal-stream, DocumentList).
          'Cloudflare stores and plays class videos.',
          // fonts.googleapis.com in public/index.html; google-oauth + calendar sync.
          'Google supplies the app’s fonts, so your browser contacts Google when a page loads. The studio also connects its own Google calendars to the app.',
          // Supabase Auth's SMTP provider sends the OTP and reset emails.
          'An email delivery service sends sign-in codes and password-reset emails.',
          // web push: the endpoint belongs to the browser's push service.
          'If you turn on notifications, the push service built into your phone or browser (run by Apple, Google or Mozilla) delivers them.',
          // Roster and class imports are CSV exports; Billing & Admin links out.
          'Enrollio, the studio’s enrollment and billing system, is where your family’s enrollment records come from. The portal’s Billing & Admin button opens it.',
        ),
        p('We may also disclose information if the law requires it, to protect someone’s safety, or as part of a sale or transfer of the studio’s business.'),
      ],
    },
    {
      id: 'photos-and-videos',
      heading: 'Class photos and videos',
      blocks: [
        p('Photos and videos in the portal are posted by studio staff. The families described under “Who can see it” can view them and save copies to their own devices. Once a copy is saved it is out of our hands, which is why our ', termsLink, ' ask families not to share other dancers’ images.'),
        p('If you would like a photo or video of your dancer taken down from the portal, email ', email, ' and we will remove it.'),
        // studioPolicies.ts: "Dance Studio Photos".
        p('How the studio uses dancers’ photos outside this app, for example in shows, on social media or in advertising, is covered by the photo permission in the DIDC Dance Student Contract. You can read it under ', studioRulesLink, '.'),
      ],
    },
    {
      id: 'children',
      heading: 'Children’s privacy',
      blocks: [
        // admin_roster_add_student refuses dancers under 13 (v58).
        p('Most of our dancers are children, and we take that seriously. Portal accounts are for parents and guardians. A dancer can have a login of their own only if they are 13 or older and their family asks the studio to set one up.'),
        p('We don’t knowingly collect personal information directly from children under 13. Information about younger dancers comes from their parents through enrollment, and from teachers taking attendance.'),
        p('Parents and guardians can ask to see, correct or delete their child’s information at any time by emailing ', email, '. If you believe a child under 13 has a login of their own, tell us and we will remove it.'),
      ],
    },
    {
      id: 'browser-storage',
      heading: 'Cookies and browser storage',
      blocks: [
        // No document.cookie anywhere in src; localStorage keys listed in the
        // data inventory (sop-app-auth, theme, view choices, seen markers).
        p('The app doesn’t use advertising or analytics cookies. To work, it keeps a few things in your browser’s own storage: your sign-in session so you stay signed in, light or dark mode, and small preferences such as which view you used last and which updates you have already seen. Staff who tick “Remember me” also have their email address kept there. The app keeps a copy of its own files too, so it opens quickly on a weak signal.'),
        p('Signing out ends your session. Clearing your browser’s data for this site removes the rest.'),
        // CalOPPA's Do Not Track disclosure.
        p('Some browsers send a “Do Not Track” signal. The app doesn’t track you across other websites or let advertising or analytics companies do so, so it treats every visit the same way whether or not the signal is sent.'),
      ],
    },
    {
      id: 'how-long',
      heading: 'How long we keep it',
      blocks: [
        p('We keep family and dancer records while your family is enrolled, and afterward as part of the studio’s records, unless you ask us to delete them. Attendance and staff time records may be kept longer where the studio needs them for its business or legal obligations.'),
        // activity_logs: no automatic deletion yet (v29). Signup attempts: ~24h.
        p('Security records (sign-ins, account changes and file activity, including IP addresses) are kept to protect accounts and investigate problems. Sign-up attempt records are deleted after about a day.'),
        p('When you ask us to delete information, we will delete it or remove what identifies you, except where the law requires us to keep it.'),
      ],
    },
    {
      id: 'security',
      heading: 'How we protect it',
      blocks: [
        // RLS on every table; private buckets; 1-hour signed URLs (portalStorage.ts).
        p('Every table in the app’s database has access rules that check who is asking, so a family sees only its own household and staff see only what their role allows. Documents and photos are stored privately and opened through links that expire within an hour. The app runs over encrypted connections (HTTPS), passwords are stored only in hashed form, and repeated sign-in and sign-up attempts are limited.'),
        // v56: one random token per account; the link is the credential.
        p('If you subscribe to the studio calendar from your phone, your calendar app uses a private link made for your account. Anyone who has that link can see the studio events your account can see, so please don’t share it.'),
        p('No system is perfectly secure. If a breach affects your information, we will tell you as the law requires.'),
      ],
    },
    {
      id: 'your-choices',
      heading: 'Your choices',
      blocks: [
        list(
          // NotificationsCard on /portal/profile.
          'Notifications: turn them on or off, and choose which kinds you get, on your profile page in the portal.',
          'Your password: change it on your profile page.',
          // AccountCard: the studio owns email addresses.
          'Your email address: the front desk can change the address on your account.',
          ['Seeing, correcting or deleting information: email ', email, ' with what you would like. We will confirm it is you and reply within 30 days.'],
          ['Closing your account: email ', email, ' and we will close it.'],
        ),
        // Cal. Civ. Code § 1798.83 ("Shine the Light").
        p('California residents: we don’t share personal information with anyone for their own marketing purposes.'),
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      blocks: [
        p('If we change this policy, we will update the date at the top of this page. If a change is significant, we will also post a notice in the portal.'),
      ],
    },
    {
      id: 'contact',
      heading: 'Contact us',
      blocks: [
        // Mid-sentence on purpose: the name ends "Inc.", which leaves no room
        // for a full stop of its own.
        p(`For questions or requests, email ${STUDIO_LEGAL.name} at `, email, ', or ask at the front desk.'),
      ],
    },
  ],
};

export const TERMS_OF_USE: LegalDoc = {
  id: 'terms',
  title: 'Terms of Use',
  intro: [
    `These terms are the rules for using ${STUDIO_LEGAL.site}, the Parent Portal and the studio’s staff tools, run by ${STUDIO_LEGAL.name} (“${STUDIO_LEGAL.shortName}”, “the studio”, “we”). By creating an account or using the app you agree to them. Please read them together with our `,
    privacyLink,
    ', which explains how we handle your information.',
  ],
  sections: [
    {
      id: 'who-can-use',
      heading: 'Who can use the app',
      blocks: [
        list(
          'Parents and guardians of dancers enrolled at the studio, who must be 18 or older.',
          'Dancers aged 13 or older, if their family asks the studio to set up a login of their own. A parent or guardian is responsible for how their dancer uses it.',
          'Studio staff, for studio work. Staff also follow the studio’s employment policies.',
        ),
        p('If you use the app on behalf of your dancer, you agree to these terms for them as well.'),
      ],
    },
    {
      id: 'your-account',
      heading: 'Your account',
      blocks: [
        list(
          'Use the email address the studio has on file for your family, and keep your details accurate.',
          'Keep your password private and don’t share your login. Each person should use their own.',
          ['Tell us straight away at ', email, ' if you think someone else has used your account.'],
          'The studio manages the email address on each account. Ask the front desk to change yours.',
        ),
      ],
    },
    {
      id: 'photos-videos-materials',
      heading: 'Class photos, videos and materials',
      blocks: [
        p('Photos, videos, music, choreography notes and other files in the portal are shared so families can follow their dancer’s classes.'),
        list(
          'You may view them and save copies for your family’s own personal use.',
          'Don’t post or share photos or video of other dancers, on social media or anywhere else, without permission from their parent or guardian.',
          'Choreography, music selections and class materials belong to the studio, its teachers or their licensors. Don’t publish, sell or redistribute them.',
          ['If you would like an image of your dancer removed from the portal, email ', email, '.'],
        ),
      ],
    },
    {
      id: 'acceptable-use',
      heading: 'Using the app fairly',
      blocks: [
        p('Please don’t:'),
        list(
          'try to see information that isn’t yours or your family’s, or get around the app’s security;',
          'copy information out of the app in bulk, or use automated tools to do so;',
          'interfere with the app or the services it runs on, or use it to break the law;',
          'use your profile nickname, or anything else in the app, to impersonate or harass anyone.',
        ),
      ],
    },
    {
      id: 'staff',
      heading: 'Staff accounts',
      blocks: [
        p('Staff accounts are for studio work. Family and dancer information is confidential: use it only to do your job, and don’t copy it, share it, or keep it when you leave. Activity in the app is logged.'),
      ],
    },
    {
      id: 'studio-policies',
      heading: 'Enrollment, tuition and studio policies',
      blocks: [
        p('Enrollment, tuition, fees, refunds and studio rules are covered by the DIDC Dance Student Contract, not by these terms, and nothing here changes it. You can read those policies under ', studioRulesLink, '.'),
      ],
    },
    {
      id: 'notifications',
      heading: 'Notifications and emails',
      blocks: [
        p('Notifications are optional, and you can turn them on or off at any time on your profile page. We email you when you need a sign-in code or ask to reset your password; those emails are part of running your account.'),
      ],
    },
    {
      id: 'availability',
      heading: 'Changes to the app and your access',
      blocks: [
        p('We may change, pause or stop parts of the app at any time. We may deactivate an account when a family is no longer enrolled, when a staff member leaves, or if these terms are broken.'),
      ],
    },
    {
      id: 'as-is',
      heading: 'The app is provided as is',
      blocks: [
        p('We work to keep the app accurate and available, but we provide it “as is” and “as available”, without warranties of any kind, to the extent the law allows. Class schedules and notices can change at short notice, and notifications can be delayed or missed, so please confirm anything important with the front desk.'),
      ],
    },
    {
      id: 'liability',
      heading: 'Limits on our liability',
      blocks: [
        p('To the fullest extent the law allows, the studio is not liable for indirect, incidental or consequential losses arising from your use of the app. Nothing in these terms limits any liability that the law does not allow to be limited.'),
      ],
    },
    {
      id: 'governing-law',
      heading: 'Governing law',
      blocks: [
        p(`These terms are governed by the laws of the State of ${STUDIO_LEGAL.state}.`),
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to these terms',
      blocks: [
        p('We may update these terms. We will change the date at the top of this page, and post a notice in the portal for significant changes. If you keep using the app after a change, the updated terms apply.'),
      ],
    },
    {
      id: 'contact',
      heading: 'Contact us',
      blocks: [
        p(`For questions about these terms, email ${STUDIO_LEGAL.name} at `, email, ', or ask at the front desk.'),
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalDoc['id'], LegalDoc> = {
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_USE,
};
