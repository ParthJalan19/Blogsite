import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const toggleLike = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const existingLike = await ctx.db
      .query("likes")
      .withIndex("by_post_and_user", (q) => 
        q.eq("postId", args.postId).eq("userId", userId)
      )
      .unique();

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    if (existingLike) {
      // Unlike
      await ctx.db.delete(existingLike._id);
      await ctx.db.patch(args.postId, {
        likesCount: Math.max(0, post.likesCount - 1),
      });
      return { liked: false, count: Math.max(0, post.likesCount - 1) };
    } else {
      // Like
      await ctx.db.insert("likes", {
        postId: args.postId,
        userId,
      });
      await ctx.db.patch(args.postId, {
        likesCount: post.likesCount + 1,
      });
      return { liked: true, count: post.likesCount + 1 };
    }
  },
});
