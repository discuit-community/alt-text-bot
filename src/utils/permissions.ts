import type { Community, User } from "@discuit-community/types";
import type { Consent } from "../types";

function hasOptIn(input: string): boolean {
  return (
    /<!--\s*altbot:opt-?in\s*-->/i.test(input) || /altbot:opt-?in/i.test(input)
  );
  return false;
}

export default function checkConsent(
  user: User,
  community: Community,
): Consent {
  const userConsent = user.aboutMe ? hasOptIn(user.aboutMe) : false;
  const communityConsent = community.about ? hasOptIn(community.about) : false;

  return {
    user: userConsent,
    community: communityConsent,
  };
}
