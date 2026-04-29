#!/usr/bin/env python3
"""
Migration script to convert plaintext PIN code to bcrypt hash.
Run this once to migrate from the old .pin_code file to the new .pin_code_hash file.
"""
import os
import bcrypt
import stat

# File paths
OLD_PIN_FILE = os.path.join(os.path.dirname(__file__), ".pin_code")
NEW_PIN_FILE = os.path.join(os.path.dirname(__file__), ".pin_code_hash")

def hash_pin_code(pin_code: str) -> str:
    """Hash a PIN code using bcrypt."""
    return bcrypt.hashpw(pin_code.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def migrate_pin():
    """Migrate from plaintext PIN to hashed PIN."""

    # Check if new hash file already exists
    if os.path.exists(NEW_PIN_FILE):
        print(f"✓ Hash file already exists: {NEW_PIN_FILE}")
        with open(NEW_PIN_FILE, 'r') as f:
            print(f"  Current hash: {f.read()[:20]}...")
        return True

    # Try to read old plaintext PIN file
    if os.path.exists(OLD_PIN_FILE):
        try:
            with open(OLD_PIN_FILE, 'r') as f:
                plaintext_pin = f.read().strip()

            if plaintext_pin and len(plaintext_pin) >= 4:
                print(f"Found plaintext PIN in {OLD_PIN_FILE}")
                print(f"Hashing PIN code...")

                # Hash the PIN
                pin_hash = hash_pin_code(plaintext_pin)

                # Save to new file
                with open(NEW_PIN_FILE, 'w') as f:
                    f.write(pin_hash)

                # Set file permissions to 0600 (owner read/write only)
                os.chmod(NEW_PIN_FILE, stat.S_IRUSR | stat.S_IWUSR)

                print(f"✓ PIN code migrated successfully to {NEW_PIN_FILE}")
                print(f"  Hash: {pin_hash[:20]}...")

                # Optionally remove old file
                print(f"\nOld plaintext file still exists: {OLD_PIN_FILE}")
                print(f"You can safely delete it after verifying the migration works.")

                return True
            else:
                print(f"⚠ PIN in {OLD_PIN_FILE} is too short or empty")
        except Exception as e:
            print(f"✗ Error reading old PIN file: {e}")
            return False

    # No old file, check environment variable
    env_pin = os.getenv("SITE_PIN_CODE")
    if env_pin:
        # Check if it's already a hash
        if env_pin.startswith('$2b$') or env_pin.startswith('$2a$') or env_pin.startswith('$2y$'):
            print("Environment variable contains a bcrypt hash")
            print("Saving to file...")

            with open(NEW_PIN_FILE, 'w') as f:
                f.write(env_pin)

            os.chmod(NEW_PIN_FILE, stat.S_IRUSR | stat.S_IWUSR)
            print(f"✓ Hash saved to {NEW_PIN_FILE}")
            return True
        else:
            print("Environment variable contains plaintext PIN")
            print("Hashing and saving...")

            pin_hash = hash_pin_code(env_pin)

            with open(NEW_PIN_FILE, 'w') as f:
                f.write(pin_hash)

            os.chmod(NEW_PIN_FILE, stat.S_IRUSR | stat.S_IWUSR)
            print(f"✓ PIN code hashed and saved to {NEW_PIN_FILE}")
            print(f"  Hash: {pin_hash[:20]}...")
            return True

    # No PIN found anywhere
    print("✗ No PIN code found!")
    print("\nPlease set a PIN code using one of these methods:")
    print("1. Set SITE_PIN_CODE environment variable:")
    print("   export SITE_PIN_CODE='your-secure-pin'")
    print("\n2. Or create the hash file manually:")
    print(f"   python -c \"import bcrypt; print(bcrypt.hashpw(b'your-pin', bcrypt.gensalt()).decode())\" > {NEW_PIN_FILE}")
    print(f"   chmod 600 {NEW_PIN_FILE}")

    return False

if __name__ == "__main__":
    print("=" * 60)
    print("PIN Code Migration Script")
    print("=" * 60)
    print()

    success = migrate_pin()

    print()
    print("=" * 60)
    if success:
        print("✓ Migration completed successfully")
    else:
        print("✗ Migration failed - please configure PIN code")
    print("=" * 60)
