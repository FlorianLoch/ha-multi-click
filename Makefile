.PHONY: image build run run-container clean push-image test

bin_dir := ./bin
image_built := ./.make/image_built
image_pushed := ./.make/image_pushed
make_dir := ./.make/
ts_files := $(shell find . -name "*.ts")
image_tag := ha-multi-click
target_platform := linux/arm64
dockerfile := Dockerfile

build: $(bin)


run: $(bin)
	$(bin)


image: $(image_built)


run-container: $(image_built)
	podman run -v $(shell pwd)/ha-multi-click.config.ts:/home/bun/app/ha-multi-click.config.ts $(image_tag)


clean:
	rm -rf $(bin_dir)
	rm -rf $(make_dir)


push-image: $(image_pushed)


$(make_dir):
	mkdir -p $(make_dir)


$(image_pushed): $(image_built)
	podman save $(image_tag) | pv | ssh pi5 docker load
	touch $(image_pushed)


$(image_built): $(ts_files) $(dockerfile) | $(make_dir)
	podman build --platform $(target_platform) --tag $(image_tag) .
	touch $(image_built)
