// Bundled into public/vendor/motion.min.js by `npm run vendor:motion`.
// GSAP (Standard "no charge" license, https://gsap.com/standard-license) + Lenis (MIT).
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { Flip } from 'gsap/Flip';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin, Flip, CustomEase);
export { gsap, ScrollTrigger, MotionPathPlugin, Flip, CustomEase, Lenis };
