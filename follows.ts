import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const toggleFollow = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) {
      throw new Error("Not authenticated");
    }

    if (currentUserId === args.userId) {
      throw new Error("Cannot follow yourself");
    }

    const existingFollow = await ctx.db
      .query("follows")
      .withIndex("by_follower_and_following", (q) => 
        q.eq("followerId", currentUserId).eq("followingId", args.userId)
      )
      .unique();

    if (existingFollow) {
      // Unfollow
      await ctx.db.delete(existingFollow._id);
      
      // Update counts
      const followerProfile = await ctx.db
        .query("userProfiles")
        .withIndex("by_user", (q) => q.eq("userId", currentUserId))
        .unique();
      
      const followingProfile = await ctx.db
        .query("userProfiles")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique();

      if (followerProfile) {
        await ctx.db.patch(followerProfile._id, {
          followingCount: Math.max(0, followerProfile.followingCount - 1),
        });
      }

      if (followingProfile) {
        await ctx.db.patch(followingProfile._id, {
          followersCount: Math.max(0, followingProfile.followersCount - 1),
        });
      }

      return { following: false };
    } else {
      // Follow
      await ctx.db.insert("follows", {
        followerId: currentUserId,
        followingId: args.userId,
      });

      // Update counts
      const followerProfile = await ctx.db
        .query("userProfiles")
        .withIndex("by_user", (q) => q.eq("userId", currentUserId))
        .unique();
      
      const followingProfile = await ctx.db
        .query("userProfiles")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique();

      if (followerProfile) {
        await ctx.db.patch(followerProfile._id, {
          followingCount: followerProfile.followingCount + 1,
        });
      }

      if (followingProfile) {
        await ctx.db.patch(followingProfile._id, {
          followersCount: followingProfile.followersCount + 1,
        });
      }

      return { following: true };
    }
  },
});

export const isFollowing = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) {
      return false;
    }

    const follow = await ctx.db
      .query("follows")
      .withIndex("by_follower_and_following", (q) => 
        q.eq("followerId", currentUserId).eq("followingId", args.userId)
      )
      .unique();

    return !!follow;
  },
});
