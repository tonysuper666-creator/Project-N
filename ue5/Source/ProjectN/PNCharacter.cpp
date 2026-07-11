#include "PNCharacter.h"
#include "Camera/CameraComponent.h"
#include "PNWeaponComponent.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/InputComponent.h"
#include "Engine/Engine.h"

APNCharacter::APNCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	// First-person camera on the capsule, at roughly eye height.
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(GetCapsuleComponent());
	Camera->SetRelativeLocation(FVector(0.f, 0.f, 64.f));
	Camera->bUsePawnControlRotation = true;

	Weapon = CreateDefaultSubobject<UPNWeaponComponent>(TEXT("Weapon"));

	GetCharacterMovement()->MaxWalkSpeed = 600.f;
	GetCharacterMovement()->AirControl = 0.5f;
}

void APNCharacter::BeginPlay()
{
	Super::BeginPlay();
	Health = MaxHealth;
}

void APNCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	// Legacy input bindings (axis/action names come from Config/DefaultInput.ini).
	// Migrate to Enhanced Input later — see the README.
	PlayerInputComponent->BindAxis("MoveForward", this, &APNCharacter::MoveForward);
	PlayerInputComponent->BindAxis("MoveRight", this, &APNCharacter::MoveRight);
	PlayerInputComponent->BindAxis("Turn", this, &APNCharacter::AddControllerYawInput);
	PlayerInputComponent->BindAxis("LookUp", this, &APNCharacter::AddControllerPitchInput);

	PlayerInputComponent->BindAction("Jump", IE_Pressed, this, &ACharacter::Jump);
	PlayerInputComponent->BindAction("Jump", IE_Released, this, &ACharacter::StopJumping);
	PlayerInputComponent->BindAction("Fire", IE_Pressed, this, &APNCharacter::StartFire);
	PlayerInputComponent->BindAction("Fire", IE_Released, this, &APNCharacter::StopFire);
	PlayerInputComponent->BindAction("Reload", IE_Pressed, this, &APNCharacter::DoReload);
}

void APNCharacter::MoveForward(float Value)
{
	if (Value != 0.f) { AddMovementInput(GetActorForwardVector(), Value); }
}

void APNCharacter::MoveRight(float Value)
{
	if (Value != 0.f) { AddMovementInput(GetActorRightVector(), Value); }
}

void APNCharacter::StartFire() { if (Weapon) { Weapon->StartFire(); } }
void APNCharacter::StopFire()  { if (Weapon) { Weapon->StopFire(); } }
void APNCharacter::DoReload()  { if (Weapon) { Weapon->Reload(); } }

float APNCharacter::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
{
	const float Applied = Super::TakeDamage(DamageAmount, DamageEvent, EventInstigator, DamageCauser);
	Health = FMath::Max(0.f, Health - Applied);
	if (Health <= 0.f && GEngine)
	{
		GEngine->AddOnScreenDebugMessage(-1, 3.f, FColor::Red, TEXT("Player down"));
		// TODO: death / respawn flow (see main.js die()).
	}
	return Applied;
}
