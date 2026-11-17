import StarterKit from "@tiptap/starter-kit";

/** Keep dash-space literal while retaining explicit lists and other shortcuts. */
export const LiteralDashStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map(extension => extension.name === "bulletList"
      ? extension.extend({
          addInputRules() {
            return (this.parent?.() ?? []).map(rule => {
              rule.find = /^\s*([+*])\s$/;
              return rule;
            });
          },
        })
      : extension);
  },
});
