-- Users table: stores Battle.net identity and tokens
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    battlenet_id BIGINT UNIQUE NOT NULL,
    battletag TEXT NOT NULL,
    access_token TEXT,       -- will store encrypted token
    refresh_token TEXT,      -- if using refresh tokens
    token_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Guilds table: stores guild info
CREATE TABLE public.guilds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    realm_slug TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'us',
    faction TEXT,            -- e.g., 'Alliance' or 'Horde', if needed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, realm_slug, region)  -- a guild is unique by name+realm+region
);

-- Characters table: stores WoW character info
CREATE TABLE public.characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    guild_id UUID REFERENCES public.guilds(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    realm_slug TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'us',
    level INT,
    class_id INT,            -- references static class ID
    race_id INT,             -- references static race ID
    guild_rank INT,          -- rank index within the guild (0 = Guild Master, etc.)
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, realm_slug, region)  -- unique character in a realm
);