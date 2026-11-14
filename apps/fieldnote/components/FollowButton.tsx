"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export function FollowButton({ id }: { id: string }) {
  const key = `fieldnote-follow-${id}`;
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    setFollowing(window.localStorage.getItem(key) === "1");
  }, [key]);

  function toggle() {
    const next = !following;
    setFollowing(next);
    window.localStorage.setItem(key, next ? "1" : "0");
  }

  return (
    <button type="button" className={`btn ghost${following ? " on" : ""}`} onClick={toggle} aria-pressed={following}>
      <Icon name="star" size={15} />
      {following ? "Following" : "Follow"}
    </button>
  );
}
