"""
Google Gemini Nano Banana Batch Image Generator for Umbra Online Zone Backgrounds

This script automates zone background generation using Google's Gemini API
with the Nano Banana (Gemini 2.5 Flash Image) or Nano Banana Pro (Gemini 3 Pro Image) models.

SETUP:
1. Get an API key from https://aistudio.google.com/apikey
2. Install the SDK: pip install google-genai pillow
3. Set environment variable: GOOGLE_API_KEY=your_api_key
   Or create a .env file with GOOGLE_API_KEY=your_api_key

Usage:
    python generate_nanobanana_images.py [options]

Options:
    --dry-run           Show prompts without generating
    --zone ZONE_ID      Generate only specific zone (e.g., --zone B3)
    --model MODEL       Model to use: 'flash' (default) or 'pro'
    --resolution RES    Resolution: '1K' (default), '2K', '4K' (pro only)
    --force             Regenerate existing images
    --delay MS          Delay between requests in ms (default: 3000)
    --export            Export prompts to text file only
    --help              Show this help

Examples:
    python generate_nanobanana_images.py --dry-run
    python generate_nanobanana_images.py --zone B3
    python generate_nanobanana_images.py --model pro --resolution 2K
    python generate_nanobanana_images.py --force
"""

import os
import sys
import json
import time
import random
import argparse
from pathlib import Path

# Configuration
CONFIG = {
    'PROMPTS_FILE': Path(__file__).parent / 'zone_prompts_all.json',
    'OUTPUT_DIR': Path(__file__).parent.parent / 'client' / 'assets' / 'zones',
    'ASPECT_RATIO': '4:3',  # Match our game's 1200x896 ratio (approximately 4:3)
    'TARGET_WIDTH': 1200,
    'TARGET_HEIGHT': 896,
    'DEFAULT_MODEL': 'pro',  # 'flash' or 'pro' - pro is higher quality
    'DEFAULT_DELAY': 5000,  # milliseconds between requests (5s to avoid rate limits)
}

# Model mapping
MODELS = {
    'flash': 'gemini-2.0-flash-exp',  # Older flash model
    'pro': 'gemini-3-pro-image-preview',  # Nano Banana Pro - state of the art
}


def load_prompts():
    """Load zone prompts from JSON file."""
    with open(CONFIG['PROMPTS_FILE'], 'r', encoding='utf-8') as f:
        return json.load(f)


def build_prompt(zone_id: str, zone_data: dict, prompts_data: dict) -> str:
    """Build an optimized prompt for Nano Banana with consistent scale."""
    biome = zone_data.get('biome', 'Fantasy')
    description = zone_data.get('description', '')
    
    # Get global prompt parts
    prefix = prompts_data.get('globalStylePrefix', '')
    suffix = prompts_data.get('globalStyleSuffix', '')
    negative = prompts_data.get('negativePrompt', '')
    
    # Map biomes to appropriate enclosure types for the "container" technique
    biome_enclosures = {
        'Cave': 'clearing enclosed by jagged rock walls and stalactites',
        'Grasslands': 'clearing enclosed by dense trees and bushes',
        'Snow': 'clearing enclosed by snow-covered pine trees and ice formations',
        'Desert': 'clearing enclosed by sand dunes and rocky outcrops',
        'Jungle': 'clearing enclosed by dense tropical vegetation and vines',
        'Beach': 'clearing enclosed by palm trees and rocky shoreline',
        'Capital City': 'courtyard enclosed by stone brick walls and buildings',
        'Bridge': 'pathway enclosed by stone railings and support pillars',
        'Empty': 'clearing enclosed by barren hills and dead vegetation',
    }
    
    enclosure = biome_enclosures.get(biome, 'clearing enclosed by natural terrain borders')
    
    # Build prompt with container technique for consistent scale
    # Format: [prefix] [biome enclosure], [description], [suffix] --neg [negative]
    prompt = f"{prefix} {enclosure}, {description}, {suffix} --neg {negative}"
    
    return prompt


def export_prompts(prompts_data: dict, output_path: Path):
    """Export prompts to a text file for manual use."""
    zones = prompts_data.get('zones', {})
    
    lines = [
        '=' * 70,
        'NANO BANANA PROMPTS FOR UMBRA ONLINE ZONE BACKGROUNDS',
        '=' * 70,
        f'Generated: {time.strftime("%Y-%m-%d %H:%M:%S")}',
        f'Total zones: {len(zones)}',
        '',
        'Instructions:',
        '1. Go to https://aistudio.google.com/',
        '2. Select Gemini 2.5 Flash Image or Gemini 3 Pro Image',
        '3. Copy each prompt and generate',
        '4. Download and rename to ZONE_ID.jpg',
        '5. Place in client/assets/zones/',
        '',
        '=' * 70,
        ''
    ]
    
    for zone_id, zone_data in zones.items():
        prompt = build_prompt(zone_id, zone_data, prompts_data)
        lines.extend([
            f'### {zone_id} - {zone_data.get("biome", "Unknown")}',
            f'Connections: {json.dumps(zone_data.get("connections", {}))}',
            f'Save as: {zone_id}.jpg',
            '',
            prompt,
            '',
            '-' * 70,
            ''
        ])
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    
    print(f'Exported {len(zones)} prompts to: {output_path}')


def generate_images(args):
    """Generate images using the Gemini API."""
    # Try to import the Google GenAI SDK
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print('ERROR: google-genai package not installed.')
        print('Install it with: pip install google-genai pillow')
        sys.exit(1)
    
    # Get API key
    api_key = os.environ.get('GOOGLE_API_KEY')
    if not api_key:
        # Try loading from .env file
        env_file = Path(__file__).parent / '.env'
        if env_file.exists():
            with open(env_file) as f:
                for line in f:
                    if line.startswith('GOOGLE_API_KEY='):
                        api_key = line.split('=', 1)[1].strip()
                        break
    
    if not api_key:
        print('ERROR: GOOGLE_API_KEY not found.')
        print('Set it as an environment variable or create a .env file in the tools folder.')
        print('Get your API key at: https://aistudio.google.com/apikey')
        sys.exit(1)
    
    # Initialize client
    client = genai.Client(api_key=api_key)
    
    # Load prompts
    prompts_data = load_prompts()
    zones = prompts_data.get('zones', {})
    
    # Filter zones if specific zone requested
    if args.zone:
        if args.zone not in zones:
            print(f'ERROR: Zone {args.zone} not found!')
            sys.exit(1)
        zones = {args.zone: zones[args.zone]}
    
    # Select model
    model_name = MODELS.get(args.model, MODELS['flash'])
    
    print('=' * 60)
    print('NANO BANANA ZONE BACKGROUND GENERATOR')
    print('=' * 60)
    print(f'Model: {model_name}')
    print(f'Zones to process: {len(zones)}')
    print(f'Aspect ratio: {CONFIG["ASPECT_RATIO"]}')
    print(f'Target size: {CONFIG["TARGET_WIDTH"]}x{CONFIG["TARGET_HEIGHT"]}')
    print(f'Output directory: {CONFIG["OUTPUT_DIR"]}')
    print(f'Dry run: {args.dry_run}')
    print('=' * 60)
    print()
    
    # Ensure output directory exists
    CONFIG['OUTPUT_DIR'].mkdir(parents=True, exist_ok=True)
    
    # Process zones
    completed = 0
    skipped = 0
    failed = 0
    total = len(zones)
    
    for i, (zone_id, zone_data) in enumerate(zones.items(), 1):
        output_path = CONFIG['OUTPUT_DIR'] / f'{zone_id}.jpg'
        
        # Skip if exists and not forcing
        if output_path.exists() and not args.force:
            print(f'[{i}/{total}] SKIP {zone_id} - already exists')
            skipped += 1
            continue
        
        prompt = build_prompt(zone_id, zone_data, prompts_data)
        biome = zone_data.get('biome', 'Unknown')
        
        print(f'[{i}/{total}] Generating {zone_id} ({biome})...')
        
        if args.dry_run:
            print(f'  Prompt:')
            print('-' * 40)
            print(prompt)
            print('-' * 40)
            print(f'  Would save to: {output_path}')
            completed += 1
            continue
        
        try:
            # Build generation config
            gen_config = types.GenerateContentConfig(
                response_modalities=['IMAGE'],
            )
            
            # Exponential backoff with jitter for rate limit errors (429)
            # This improves success rate from 20% to 100% per Google's testing
            max_retries = 5
            base_delay = 5  # seconds
            
            for attempt in range(max_retries):
                try:
                    # Generate image
                    response = client.models.generate_content(
                        model=model_name,
                        contents=[prompt],
                        config=gen_config
                    )
                    break  # Success, exit retry loop
                except Exception as retry_error:
                    error_str = str(retry_error).lower()
                    
                    # Check for retryable errors (429, 503, overloaded)
                    is_rate_limit = '429' in str(retry_error) or 'resource_exhausted' in error_str or 'quota' in error_str
                    is_overloaded = '503' in str(retry_error) or 'overloaded' in error_str
                    
                    if is_rate_limit or is_overloaded:
                        if attempt < max_retries - 1:
                            # Exponential backoff with jitter
                            delay = min(base_delay * (2 ** attempt), 120)  # Cap at 2 minutes
                            jitter = random.uniform(0, delay * 0.5)  # Add up to 50% jitter
                            total_delay = delay + jitter
                            
                            error_type = "Rate limited (429)" if is_rate_limit else "Model overloaded (503)"
                            print(f'  {error_type}, waiting {total_delay:.1f}s... (attempt {attempt + 2}/{max_retries})')
                            time.sleep(total_delay)
                        else:
                            raise  # Last attempt failed
                    else:
                        raise  # Different error, don't retry
            
            # Save the image
            image_saved = False
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data is not None:
                    # Get the raw image bytes
                    image_data = part.inline_data.data
                    mime_type = part.inline_data.mime_type
                    
                    # Save using PIL
                    from PIL import Image
                    import io
                    
                    image = Image.open(io.BytesIO(image_data))
                    
                    # Resize to target dimensions
                    image = image.resize((CONFIG['TARGET_WIDTH'], CONFIG['TARGET_HEIGHT']), Image.LANCZOS)
                    
                    # Convert to RGB if necessary and save as JPEG
                    if image.mode in ('RGBA', 'P'):
                        image = image.convert('RGB')
                    image.save(output_path, 'JPEG', quality=95)
                    print(f'  Saved: {output_path}')
                    image_saved = True
                    completed += 1
                    break
            
            if not image_saved:
                print(f'  ERROR: No image in response')
                failed += 1
                
        except Exception as e:
            print(f'  ERROR: {str(e)}')
            failed += 1
        
        # Rate limiting delay (except for last item)
        if i < total and not args.dry_run:
            delay_sec = args.delay / 1000
            print(f'  Waiting {delay_sec}s...')
            time.sleep(delay_sec)
    
    # Summary
    print()
    print('=' * 60)
    print('GENERATION COMPLETE')
    print('=' * 60)
    print(f'Completed: {completed}')
    print(f'Skipped: {skipped}')
    print(f'Failed: {failed}')
    print(f'Output: {CONFIG["OUTPUT_DIR"]}')


def main():
    parser = argparse.ArgumentParser(
        description='Generate zone backgrounds using Google Gemini Nano Banana',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument('--dry-run', action='store_true',
                        help='Show prompts without generating')
    parser.add_argument('--zone', type=str,
                        help='Generate only specific zone (e.g., B3)')
    parser.add_argument('--model', type=str, default='pro',
                        choices=['flash', 'pro'],
                        help='Model: flash (fast) or pro (high quality, default)')
    parser.add_argument('--force', action='store_true',
                        help='Regenerate existing images')
    parser.add_argument('--delay', type=int, default=CONFIG['DEFAULT_DELAY'],
                        help='Delay between requests in ms')
    parser.add_argument('--export', action='store_true',
                        help='Export prompts to text file only')
    
    args = parser.parse_args()
    
    # Export mode
    if args.export:
        prompts_data = load_prompts()
        output_path = Path(__file__).parent / 'nanobanana_prompts_export.txt'
        export_prompts(prompts_data, output_path)
        return
    
    # Generate images
    generate_images(args)


if __name__ == '__main__':
    main()
