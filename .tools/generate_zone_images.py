"""
Zone Background Image Generator for ComfyUI
============================================
This script generates prompts and can queue them to ComfyUI via API.

Usage:
  1. Make sure ComfyUI is running (default: http://127.0.0.1:8188)
  2. Run: python generate_zone_images.py

Options:
  --prompts-only    Just output the prompts to a text file (no ComfyUI needed)
  --zone ZONE_ID    Generate only a specific zone (e.g., --zone B3)
  --dry-run         Show what would be generated without actually doing it
"""

import json
import os
import sys
import argparse
import urllib.request
import urllib.error
import time

# Configuration
COMFYUI_URL = "http://127.0.0.1:8188"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROMPTS_FILE = os.path.join(SCRIPT_DIR, "zone_prompts_all.json")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "..", "client", "assets", "zones")

# Workflow template - modify this to match your ComfyUI setup
WORKFLOW_TEMPLATE = {
    "3": {
        "class_type": "KSampler",
        "inputs": {
            "cfg": 7.5,
            "denoise": 1,
            "latent_image": ["5", 0],
            "model": ["4", 0],
            "negative": ["7", 0],
            "positive": ["6", 0],
            "sampler_name": "dpmpp_2m",
            "scheduler": "karras",
            "seed": -1,  # Random seed
            "steps": 30
        }
    },
    "4": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
            "ckpt_name": "dreamshaper_8.safetensors"  # UPDATE THIS to your model
        }
    },
    "5": {
        "class_type": "EmptyLatentImage",
        "inputs": {
            "batch_size": 1,
            "height": 768,
            "width": 1024
        }
    },
    "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "clip": ["4", 1],
            "text": ""  # Will be filled with positive prompt
        }
    },
    "7": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "clip": ["4", 1],
            "text": ""  # Will be filled with negative prompt
        }
    },
    "8": {
        "class_type": "VAEDecode",
        "inputs": {
            "samples": ["3", 0],
            "vae": ["4", 2]
        }
    },
    "9": {
        "class_type": "SaveImage",
        "inputs": {
            "filename_prefix": "",  # Will be filled with zone ID
            "images": ["8", 0]
        }
    }
}


def load_zone_prompts():
    """Load all zone prompts from JSON file."""
    with open(PROMPTS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def build_full_prompt(zone_data, global_suffix):
    """Combine zone description with global style suffix."""
    return zone_data['description'] + global_suffix


def create_workflow(zone_id, positive_prompt, negative_prompt, settings):
    """Create a ComfyUI workflow for a specific zone."""
    workflow = json.loads(json.dumps(WORKFLOW_TEMPLATE))  # Deep copy
    
    # Update prompts
    workflow["6"]["inputs"]["text"] = positive_prompt
    workflow["7"]["inputs"]["text"] = negative_prompt
    
    # Update settings
    workflow["5"]["inputs"]["width"] = settings.get("width", 1024)
    workflow["5"]["inputs"]["height"] = settings.get("height", 768)
    workflow["3"]["inputs"]["steps"] = settings.get("steps", 30)
    workflow["3"]["inputs"]["cfg"] = settings.get("cfg", 7.5)
    workflow["3"]["inputs"]["sampler_name"] = settings.get("sampler", "dpmpp_2m")
    workflow["3"]["inputs"]["scheduler"] = settings.get("scheduler", "karras")
    
    # Set output filename
    workflow["9"]["inputs"]["filename_prefix"] = f"zones/{zone_id}"
    
    return workflow


def queue_prompt(workflow):
    """Send a workflow to ComfyUI for processing."""
    data = json.dumps({"prompt": workflow}).encode('utf-8')
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        response = urllib.request.urlopen(req)
        return json.loads(response.read())
    except urllib.error.URLError as e:
        print(f"Error connecting to ComfyUI: {e}")
        print("Make sure ComfyUI is running at", COMFYUI_URL)
        return None


def check_comfyui_running():
    """Check if ComfyUI is accessible."""
    try:
        urllib.request.urlopen(f"{COMFYUI_URL}/system_stats", timeout=5)
        return True
    except:
        return False


def export_prompts_to_file(prompts_data):
    """Export all prompts to a text file for manual use."""
    output_file = os.path.join(SCRIPT_DIR, "zone_prompts_export.txt")
    
    global_suffix = prompts_data['globalStyleSuffix']
    negative = prompts_data['negativePrompt']
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("=" * 80 + "\n")
        f.write("ZONE BACKGROUND PROMPTS FOR COMFYUI\n")
        f.write("=" * 80 + "\n\n")
        
        f.write("NEGATIVE PROMPT (use for all):\n")
        f.write("-" * 40 + "\n")
        f.write(negative + "\n\n")
        
        f.write("SETTINGS:\n")
        f.write("-" * 40 + "\n")
        f.write(f"Width: {prompts_data['settings']['width']}\n")
        f.write(f"Height: {prompts_data['settings']['height']}\n")
        f.write(f"Steps: {prompts_data['settings']['steps']}\n")
        f.write(f"CFG: {prompts_data['settings']['cfg']}\n")
        f.write(f"Sampler: {prompts_data['settings']['sampler']}\n")
        f.write(f"Scheduler: {prompts_data['settings']['scheduler']}\n\n")
        
        f.write("=" * 80 + "\n")
        f.write("ZONE PROMPTS\n")
        f.write("=" * 80 + "\n\n")
        
        for zone_id, zone_data in prompts_data['zones'].items():
            full_prompt = build_full_prompt(zone_data, global_suffix)
            f.write(f"[{zone_id}] - {zone_data['biome']}\n")
            f.write("-" * 40 + "\n")
            f.write(f"{full_prompt}\n\n")
    
    print(f"Prompts exported to: {output_file}")
    return output_file


def main():
    parser = argparse.ArgumentParser(description='Generate zone background images')
    parser.add_argument('--prompts-only', action='store_true', 
                        help='Just export prompts to text file')
    parser.add_argument('--zone', type=str, 
                        help='Generate only a specific zone (e.g., B3)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be generated without doing it')
    parser.add_argument('--delay', type=float, default=2.0,
                        help='Delay between queue requests (seconds)')
    parser.add_argument('--checkpoint', type=str,
                        help='Override checkpoint model name')
    
    args = parser.parse_args()
    
    # Load prompts
    print("Loading zone prompts...")
    prompts_data = load_zone_prompts()
    
    global_suffix = prompts_data['globalStyleSuffix']
    negative_prompt = prompts_data['negativePrompt']
    settings = prompts_data['settings']
    zones = prompts_data['zones']
    
    print(f"Loaded {len(zones)} zones")
    
    # Export prompts only mode
    if args.prompts_only:
        export_prompts_to_file(prompts_data)
        return
    
    # Filter to specific zone if requested
    if args.zone:
        if args.zone not in zones:
            print(f"Error: Zone '{args.zone}' not found!")
            print(f"Available zones: {', '.join(sorted(zones.keys()))}")
            return
        zones = {args.zone: zones[args.zone]}
    
    # Dry run mode
    if args.dry_run:
        print("\n=== DRY RUN - Would generate these zones ===\n")
        for zone_id, zone_data in sorted(zones.items()):
            full_prompt = build_full_prompt(zone_data, global_suffix)
            print(f"[{zone_id}] {zone_data['biome']}")
            print(f"  Prompt: {full_prompt[:100]}...")
            print()
        print(f"Total: {len(zones)} images")
        return
    
    # Check ComfyUI is running
    print("\nChecking ComfyUI connection...")
    if not check_comfyui_running():
        print(f"ERROR: Cannot connect to ComfyUI at {COMFYUI_URL}")
        print("Please make sure ComfyUI is running first!")
        print("\nAlternatively, use --prompts-only to export prompts for manual use.")
        return
    
    print("ComfyUI is running!")
    
    # Update checkpoint if specified
    if args.checkpoint:
        WORKFLOW_TEMPLATE["4"]["inputs"]["ckpt_name"] = args.checkpoint
        print(f"Using checkpoint: {args.checkpoint}")
    
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Process each zone
    print(f"\nGenerating {len(zones)} zone backgrounds...")
    print("=" * 50)
    
    successful = 0
    failed = 0
    
    for i, (zone_id, zone_data) in enumerate(sorted(zones.items()), 1):
        full_prompt = build_full_prompt(zone_data, global_suffix)
        
        print(f"\n[{i}/{len(zones)}] Generating {zone_id} ({zone_data['biome']})...")
        
        # Create and queue workflow
        workflow = create_workflow(zone_id, full_prompt, negative_prompt, settings)
        result = queue_prompt(workflow)
        
        if result:
            print(f"  ✓ Queued successfully (prompt_id: {result.get('prompt_id', 'unknown')})")
            successful += 1
        else:
            print(f"  ✗ Failed to queue")
            failed += 1
        
        # Delay between requests to avoid overwhelming ComfyUI
        if i < len(zones):
            time.sleep(args.delay)
    
    print("\n" + "=" * 50)
    print(f"COMPLETE: {successful} queued, {failed} failed")
    print(f"\nImages will be saved to ComfyUI's output folder.")
    print(f"Copy them to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
