-- Create table for WoW classes
CREATE TABLE public.wow_classes (
    id INT PRIMARY KEY,
    name TEXT NOT NULL
);

-- Create table for WoW races
CREATE TABLE public.wow_races (
    id INT PRIMARY KEY,
    name TEXT NOT NULL
);

-- Create table for WoW realms
CREATE TABLE public.wow_realms (
    id INT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL
);