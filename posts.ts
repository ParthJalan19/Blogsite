import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const createPost = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    excerpt: v.string(),
    published: v.boolean(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const postId = await ctx.db.insert("posts", {
      title: args.title,
      content: args.content,
      excerpt: args.excerpt,
      authorId: userId,
      published: args.published,
      tags: args.tags,
      likesCount: 0,
      commentsCount: 0,
    });

    // Update user's posts count
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    
    if (profile) {
      await ctx.db.patch(profile._id, {
        postsCount: profile.postsCount + 1,
      });
    }

    return postId;
  },
});

export const updatePost = mutation({
  args: {
    postId: v.id("posts"),
    title: v.string(),
    content: v.string(),
    excerpt: v.string(),
    published: v.boolean(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const post = await ctx.db.get(args.postId);
    if (!post || post.authorId !== userId) {
      throw new Error("Post not found or not authorized");
    }

    await ctx.db.patch(args.postId, {
      title: args.title,
      content: args.content,
      excerpt: args.excerpt,
      published: args.published,
      tags: args.tags,
    });

    return args.postId;
  },
});

export const deletePost = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const post = await ctx.db.get(args.postId);
    if (!post || post.authorId !== userId) {
      throw new Error("Post not found or not authorized");
    }

    // Delete all comments for this post
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
    
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    // Delete all likes for this post
    const likes = await ctx.db
      .query("likes")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
    
    for (const like of likes) {
      await ctx.db.delete(like._id);
    }

    await ctx.db.delete(args.postId);

    // Update user's posts count
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    
    if (profile) {
      await ctx.db.patch(profile._id, {
        postsCount: Math.max(0, profile.postsCount - 1),
      });
    }

    return args.postId;
  },
});

export const getPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) {
      return null;
    }

    const author = await ctx.db.get(post.authorId);
    const userId = await getAuthUserId(ctx);
    
    let isLiked = false;
    if (userId) {
      const like = await ctx.db
        .query("likes")
        .withIndex("by_post_and_user", (q) => 
          q.eq("postId", args.postId).eq("userId", userId)
        )
        .unique();
      isLiked = !!like;
    }

    return {
      ...post,
      author: author ? { name: author.name, email: author.email } : null,
      isLiked,
    };
  },
});

export const getPosts = query({
  args: {
    published: v.optional(v.boolean()),
    authorId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let posts;
    
    if (args.published !== undefined) {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_published", (q) => q.eq("published", args.published!))
        .order("desc")
        .take(args.limit || 20);
    } else if (args.authorId) {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_author", (q) => q.eq("authorId", args.authorId!))
        .order("desc")
        .take(args.limit || 20);
    } else {
      posts = await ctx.db
        .query("posts")
        .order("desc")
        .take(args.limit || 20);
    }

    const userId = await getAuthUserId(ctx);
    const postsWithAuthors = await Promise.all(
      posts.map(async (post) => {
        const author = await ctx.db.get(post.authorId);
        
        let isLiked = false;
        if (userId) {
          const like = await ctx.db
            .query("likes")
            .withIndex("by_post_and_user", (q) => 
              q.eq("postId", post._id).eq("userId", userId)
            )
            .unique();
          isLiked = !!like;
        }

        return {
          ...post,
          author: author ? { name: author.name, email: author.email } : null,
          isLiked,
        };
      })
    );

    return postsWithAuthors;
  },
});

export const getFollowingPosts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    // Get users that the current user follows
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", userId))
      .collect();

    const followingIds = follows.map(f => f.followingId);
    
    // Get posts from followed users
    const allPosts = [];
    for (const authorId of followingIds) {
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_author", (q) => q.eq("authorId", authorId))
        .filter((q) => q.eq(q.field("published"), true))
        .collect();
      allPosts.push(...posts);
    }

    // Sort by creation time and limit
    const sortedPosts = allPosts
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, args.limit || 20);

    const postsWithAuthors = await Promise.all(
      sortedPosts.map(async (post) => {
        const author = await ctx.db.get(post.authorId);
        
        let isLiked = false;
        if (userId) {
          const like = await ctx.db
            .query("likes")
            .withIndex("by_post_and_user", (q) => 
              q.eq("postId", post._id).eq("userId", userId)
            )
            .unique();
          isLiked = !!like;
        }

        return {
          ...post,
          author: author ? { name: author.name, email: author.email } : null,
          isLiked,
        };
      })
    );

    return postsWithAuthors;
  },
});
