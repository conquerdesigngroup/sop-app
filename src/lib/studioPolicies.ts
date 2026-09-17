/**
 * The studio's rules and policies, as text the app renders itself.
 *
 * WHY THIS IS DATA IN THE REPO AND NOT A PDF
 *
 * The same words exist as a signed PDF — the DIDC Dance Student Contract — and
 * a link to that file was the obvious thing to put on the dashboard. It is also
 * the thing a parent cannot read: tapping a PDF on a phone hands the page to
 * the system viewer, at a zoom level set for a sheet of paper, outside the app
 * and outside the back button. A parent checking whether they owe a late fee
 * should not have to pinch-zoom a contract to find out.
 *
 * So the wording is carried here and laid out as app content that reflows to
 * the phone, re-themes in dark and light mode, and is selectable and
 * searchable. The text is verbatim from the contract; the headings and the
 * order are the contract's own.
 *
 * WHEN THE STUDIO CHANGES A POLICY
 *
 * Edit the item below and ship. This is deliberately NOT in portal_content: a
 * policy change is a change to what families signed, and it should travel
 * through a review and a deploy the same way a price in the code would, not
 * through an editor where a mistyped fee is live to every family at once.
 *
 * Both sections render the same set — All-Star and Academy/TNT sign the same
 * contract. If that ever stops being true, key this by ProgramSlug rather than
 * forking the page.
 */

/** A run of body text. `strong` is a phrase the contract sets in bold. */
export interface PolicyRun {
  text: string;
  strong: boolean;
}

export interface PolicyItem {
  /** The bold lead-in, e.g. "Tuition Payments". */
  term: string;
  /** Body text. `**...**` wraps a phrase the contract prints in bold. */
  body: string;
}

export interface PolicySection {
  heading: string;
  items: PolicyItem[];
  /**
   * A line the contract sets apart in its own box, printed after the items.
   * Kept separate from the items because it is a restatement, not a policy —
   * it is the one sentence the studio wants read twice.
   */
  callout?: string;
}

export interface StudioPolicyDocument {
  title: string;
  intro: string;
  sections: PolicySection[];
  /** Where these words come from, printed at the foot of the page. */
  source: string;
}

/**
 * Split a body string into plain and bold runs.
 *
 * A two-line parser rather than markdown or HTML, for the same reason
 * ProgramUpdates renders plain paragraphs: whatever ends up on a family's
 * screen should be text React escapes, never a string handed to
 * dangerouslySetInnerHTML. `**` is only ever a formatting hint here — an
 * unbalanced pair renders as text, it cannot produce markup.
 *
 * Odd indices are what sat between a pair of `**`. Empty runs are dropped so a
 * body that opens with a bold phrase does not render a stray empty span.
 */
export const policyRuns = (body: string): PolicyRun[] =>
  body
    .split('**')
    .map((text, i) => ({ text, strong: i % 2 === 1 }))
    .filter(run => run.text.length > 0);

export const STUDIO_POLICIES: StudioPolicyDocument = {
  title: 'Studio Rules & Policies',
  intro:
    'The following are the policies for Dancing Images Dance Center, Inc. Now referred to as DIDC. Please read through each item;',
  source: 'From the DIDC Dance Student Contract.',
  sections: [
    {
      heading: 'Studio Policies',
      callout: 'No credits or refunds are given.',
      items: [
        {
          term: 'Tuition Payments',
          body:
            'All payments will be an automatic withdrawal from a credit card. Withdrawals will be completed on the 1st and 15th of each month. If payment is not received 5 days after the scheduled withdrawal date a $25.00 late fee will be applied.',
        },
        {
          term: 'Registration Fee',
          body:
            'We have a one time registration fee of $35.00 upon sign up. **This is non-refundable. If a member drops at any time, they will be charged the Registration Fee again when reregistering.**',
        },
        {
          term: 'Membership Fee',
          body:
            'There is an annual Membership Fee of $35.00 for each of our members on August 15th. This fee helps cover our admin fees for preparing the new season.',
        },
        {
          term: 'Declined Withdrawals',
          body: 'Will be charged a $25.00 (Subject to change) service fee.',
        },
        {
          term: 'Withdrawal from DIDC',
          body:
            'If a student withdraws from the studio, the parent must give the studio one month notice. We will discontinue your monthly payments at that time. **No credits or refunds are given.**',
        },
        {
          term: 'Makeups and Credits',
          body:
            'If a student missed a class, it is their responsibility to make the class up. Each faculty member has a list of makeup classes to attend. All makeup classes are to be taken within 30 days of the absence.',
        },
      ],
    },
    {
      heading: 'In the Studio',
      items: [
        {
          term: 'Class Schedules',
          body:
            'Classes are subject to cancellation, rescheduling, and the use of subs at DIDC’s discretion. In the unforeseen circumstances of bad weather, power outage, or any other "Act of God" events, DIDC reserves the right to cancel class. There must be at least 5 students in a class for the class to be held. If a class falls below this requirement, it may be canceled at any time during the year and the students will be placed in a similar class and you will be notified.',
        },
        {
          term: 'Absences and Vacations',
          body:
            'If a dancer is absent, please give us a courtesy call, text message or email to let us know of your dancer’s absence. In regards to vacations, please fill out a "Vacation Form" prior to leaving. Then the dancer may take "make-up" lessons when they return. It is crucial to their training to "not skip a beat". **No credits or refunds are given.**',
        },
        {
          term: 'Classroom Courtesy',
          body:
            'All dancers must arrive on time. It is a disruption to the class as well as a disservice to the dancer if they are late to warm ups. Dancers who miss the warm up section of class will not be allowed to participate in the class. Parents and guests are not allowed in the room at any time. There is no food or drinks allowed in the dance rooms. Dancers may bring in water bottles.',
        },
        {
          term: 'Dress code',
          body:
            'All dancers are required to wear the dress code for the appropriate class. Please refer to the students’ teacher for clarification.',
        },
        {
          term: 'Dance Studio Photos',
          body:
            'I give the studio permission to use my child’s photo for studio use. This includes, but not limited to, studio in house slides, shows, social media and advertisements.',
        },
      ],
    },
  ],
};

// ============================================================================
// DRESS CODE
// ============================================================================

/**
 * The studio's dress code packet, as app content.
 *
 * Same reasoning as the contract above — see this file's header — and the same
 * source discipline: the wording is the packet's, the grouping is the packet's,
 * and the five printed sections map one-to-one onto the three groups below
 * (each of TNT and Junior & Teen carries its own "what not to bring" and tips
 * page; Male Students has neither, and none is invented for it).
 *
 * WHY THIS IS SHAPED DIFFERENTLY FROM THE CONTRACT
 *
 * The contract is a flat list of terms and paragraphs. The dress code is not:
 * it is a grid, and the question a parent actually arrives with — "what does my
 * eight-year-old wear to ballet on Tuesday?" — needs three coordinates to
 * answer. Age group, then what part of the outfit, then which style. Flattening
 * that into term-and-paragraph would make the reader hold two of the three in
 * their head while scanning for the third.
 *
 * So the group is a control rather than a heading. A family has dancers in one
 * band, and showing all three at once is not merely long: the rules differ per
 * band, in small ways (pink tights at TNT, black leotard and pink tights at
 * Junior), which is exactly the kind of difference a reader skims past and gets
 * wrong.
 */

export interface DressCodeRule {
  /** The style this applies to — "Ballet", "Hip Hop". Null if it applies to all. */
  label: string | null;
  text: string;
}

export interface DressCodeBlock {
  /** "Hair", "Attire", "Shoes". */
  heading: string;
  rules: DressCodeRule[];
}

export interface DressCodeGroup {
  id: string;
  /** Short, for the selector. */
  label: string;
  /** Who it covers, printed under the selector. */
  who: string;
  blocks: DressCodeBlock[];
  /** The packet's "what not to bring" / "what not to wear" page. */
  avoid?: { heading: string; items: PolicyItem[] };
  /** The packet's tips for parents. Absent where the packet prints none. */
  tips?: string[];
}

/** Repeated verbatim on both tips pages in the packet. */
const SHARED_TIPS = [
  'Label your dancer’s belongings and keep them safe and clean in a dance bag!',
  'Arrive 5–10 minutes early to allow time for a pre-class bathroom visit and to put dance shoes on. Rushing to class = a stressed dancer!',
];

const ATTENDANCE_TIP =
  'We all have to miss class once in a while (we get it!), but your dancer’s attendance will provide the consistency dance requires for progress to take place.';

const FUN_TIP =
  'Fun is important for growth! We encourage you to talk about dance class with your little one when you are at home to keep the joy going all week long!';

const JEWELRY =
  'Necklaces, bracelets, and rings can scratch other students or catch on clothing during dance class and become a hazard.';

export const STUDIO_DRESS_CODE: {
  title: string;
  intro: string;
  groups: DressCodeGroup[];
} = {
  title: 'Dress Code',
  intro:
    'Every dancer wears the dress code for their class. Pick the group your dancer is in — the rules differ between them.',
  groups: [
    {
      id: 'tnt',
      label: 'Tiny & Talented',
      who: 'TNT · 2 to 6 year olds',
      blocks: [
        {
          heading: 'Hair',
          rules: [
            { label: null, text: 'Hair must be pulled back into a bun or ponytail for class. Bobby pins and hairspray are very helpful!' },
          ],
        },
        {
          heading: 'Attire',
          rules: [
            { label: 'Ballet & Tap', text: 'Solid colored leotard. Skirt/Tutu is optional. Pink tights.' },
            { label: 'Hip Hop', text: 'Leggings/sweats and a t-shirt/tank.' },
            { label: 'Acro / Acro Jazz', text: 'Leotard/tank and leggings/shorts.' },
          ],
        },
        {
          heading: 'Shoes',
          rules: [
            { label: 'Ballet', text: 'Pink ballet shoes.' },
            { label: 'Tap', text: 'Black tap shoes. With or without laces are acceptable.' },
            { label: 'Jazz', text: 'Black or Tan jazz shoes.' },
            { label: 'Hip Hop', text: 'Clean sneakers.' },
            { label: 'Acro', text: 'Students will go barefoot.' },
          ],
        },
      ],
      avoid: {
        heading: 'What not to bring',
        items: [
          { term: 'Jewelry', body: JEWELRY },
          { term: 'Toys', body: 'Toys are best kept safe with mom or dad; they are a distraction in dance class. Our instructors have fun props to use!' },
        ],
      },
      tips: [
        ...SHARED_TIPS,
        'Create a “go-have-fun” ritual with your little one! Consistency is key when creating a loving yet firm separation expectation. A hug & kiss, a silly face, or a special handshake can do the trick!',
        ATTENDANCE_TIP,
        FUN_TIP,
      ],
    },
    {
      id: 'junior',
      label: 'Junior & Teen',
      who: '7 to 18 year olds',
      blocks: [
        {
          heading: 'Hair',
          rules: [
            { label: null, text: 'Hair must be pulled back into a bun or ponytail for class. Buns for Ballet. Bobby pins and hairspray are very helpful!' },
          ],
        },
        {
          heading: 'Attire',
          rules: [
            { label: 'Ballet', text: 'Black leotard and pink tights.' },
            { label: 'Tap', text: 'Solid color leotard/tank and leggings/shorts.' },
            { label: 'Acro / Jazz / Contemporary', text: 'Solid color leotard/tank and leggings/shorts.' },
            { label: 'Hip Hop', text: 'T-shirt/tank and sweats/leggings.' },
          ],
        },
        {
          heading: 'Shoes',
          rules: [
            { label: 'Ballet', text: 'Pink split-sole ballet shoes.' },
            { label: 'Tap', text: 'Black tap shoes, with or without laces are acceptable.' },
            { label: 'Jazz & Contemporary', text: 'Tan/Black jazz shoes and or half soles.' },
            { label: 'Hip Hop', text: 'Clean sneakers.' },
            { label: 'Acro', text: 'Students will go barefoot.' },
          ],
        },
      ],
      avoid: {
        heading: 'What not to wear',
        items: [
          { term: 'Jewelry', body: `${JEWELRY} Anything lost or stolen will not be our responsibility.` },
          { term: 'Valuables', body: 'Please do not bring valuables such as iPads, tablets, laptops, etc.' },
        ],
      },
      tips: [
        ...SHARED_TIPS,
        'School can be tiring at this age and homework can be demanding. We encourage dancers to be as dedicated to their academic studies as they are to their dance training! Creating a homework schedule and study plan with your dancer will hold them accountable and will reduce stress about balancing school and dance.',
        ATTENDANCE_TIP,
        FUN_TIP,
      ],
    },
    {
      id: 'male',
      label: 'Male students',
      who: 'All ages',
      blocks: [
        {
          heading: 'Hair',
          rules: [
            { label: null, text: 'Hair should be neat for class. If hair is long, please secure away from face. Hats are allowed (Hip Hop only).' },
          ],
        },
        {
          heading: 'Attire',
          rules: [
            { label: 'Ballet', text: 'White/black form fitting t-shirt and black shorts or leggings.' },
            { label: 'Tap / Acro / Jazz / Contemporary', text: 'Black pants/shorts and t-shirt.' },
            { label: 'Hip Hop', text: 'Sweats/shorts and t-shirt.' },
          ],
        },
        {
          heading: 'Shoes',
          rules: [
            { label: 'Ballet', text: 'Black ballet shoes.' },
            { label: 'Tap', text: 'Black tap shoes, with or without laces are acceptable.' },
            { label: 'Jazz & Contemporary', text: 'Black jazz shoes and or half soles.' },
            { label: 'Hip Hop', text: 'Clean sneakers.' },
            { label: 'Acro', text: 'Students will go barefoot.' },
          ],
        },
      ],
      // No avoid block and no tips: the packet prints neither for this section,
      // and inventing them would put words in the studio's mouth.
    },
  ],
};
