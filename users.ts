import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getUserProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    return {
      ...user,
      profile: profile || {
        bio: null,
        website: null,
        location: null,
        avatar: null,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
      },
    };
  },
});

export const updateUserName = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(userId, {
      name: args.name,
    });

    return userId;
  },
});

export const updateProfile = mutation({
  args: {
    bio: v.optional(v.string()),
    website: v.optional(v.string()),
    location: v.optional(v.string()),
    avatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const existingProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existingProfile) {
      await ctx.db.patch(existingProfile._id, {
        bio: args.bio,
        website: args.website,
        location: args.location,
        avatar: args.avatar,
      });
    } else {
      await ctx.db.insert("userProfiles", {
        userId,
        bio: args.bio,
        website: args.website,
        location: args.location,
        avatar: args.avatar,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
      });
    }

    return userId;
  },
});

export const searchUsers = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    if (!args.query.trim()) {
      return [];
    }

    const users = await ctx.db.query("users").collect();
    const filteredUsers = users.filter(user => 
      user.name?.toLowerCase().includes(args.query.toLowerCase()) ||
      user.email?.toLowerCase().includes(args.query.toLowerCase())
    );

    const usersWithProfiles = await Promise.all(
      filteredUsers.slice(0, 10).map(async (user) => {
        const profile = await ctx.db
          .query("userProfiles")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .unique();

        return {
          ...user,
          profile: profile || {
            bio: null,
            website: null,
            location: null,
            avatar: null,
            followersCount: 0,
            followingCount: 0,
            postsCount: 0,
          },
        };
      })
    );

    return usersWithProfiles;
  },
});
