const ros = require("rosnodejs");
const { createCanvas, loadImage } = require("canvas");
const { atob } = require("abab");

const f = async () => {
    // Set up ROS node and publishers
    await ros.initNode("/fbridge");
    const node = ros.nh;
    const compressedImagePublisher = node.advertise(
        "/image/compressed",
        "sensor_msgs/CompressedImage"
    );
    const northEastQuadrantPublisher = node.advertise(
        "/in_northeast_quadrant",
        "std_msgs/Bool"
    );
    const southWestQuadrantPublisher = node.advertise(
        "/in_southwest_quadrant",
        "std_msgs/Bool"
    );
    const commandVelocityPublisher = node.advertise(
        "/turtle1/cmd_vel",
        "geometry_msgs/Twist"
    );

    const poseRange = 11.1; // turtlesim constant
    const turtleImage = await loadImage("lunar.png");
    let trail = false;

    const canvas = createCanvas(640, 640);
    const context = canvas.getContext("2d");
    const renderAndPublishCompressedImage = pose => {
        context.save();
        context.globalAlpha = trail ? 0.12 : 1.0;
        context.fillStyle = "black";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const cx = Math.floor((pose.x * canvas.width) / poseRange);
        const cy = Math.floor(
            canvas.height - (canvas.height * pose.y) / poseRange
        );

        context.translate(cx, cy);
        context.rotate(Math.PI / 2 - pose.theta);
        context.globalAlpha = 1.0;
        context.drawImage(
            turtleImage,
            -turtleImage.width / 2,
            -turtleImage.height / 2,
            (width = turtleImage.width),
            (height = turtleImage.height)
        );
        context.restore();

        const dataUrl = canvas.toDataURL();
        const base64 = dataUrl.split("base64,")[1];
        const buffer = atob(base64)
            .split("")
            .map(_ => _.charCodeAt(0));

        const compressedImage = {
            header: {
                seq: 0,
                stamp: Date.now(),
                frame_id: ""
            },
            format: "png",
            data: buffer
        };

        compressedImagePublisher.publish(compressedImage);
    };

    const handleQuadrantIndicators = pose => {
        pose.x > poseRange / 2 && pose.y > poseRange / 2
            ? northEastQuadrantPublisher.publish({ data: true })
            : northEastQuadrantPublisher.publish({ data: false });

        pose.x < poseRange / 2 && pose.y < poseRange / 2
            ? southWestQuadrantPublisher.publish({ data: true })
            : southWestQuadrantPublisher.publish({ data: false });
    };

    let seq = 0;
    const handlePose = pose => {
        seq += 1;
        if (seq % 2 !== 0) {
            return; // only render and publish every other frame - ~30fps
        }
        renderAndPublishCompressedImage(pose);
        handleQuadrantIndicators(pose);
    };

    let spin = false;
    let lx = 0.0;
    let az = 0.0;
    let dlx = 0.01;
    let daz = 0.022;
    setInterval(() => {
        if (spin) {
            lx += dlx;
            az += daz;
            if (lx > dlx * 20000) {
                lx = dlx * 20000;
            }
            if (az > daz * 20000) {
                az = daz * 20000;
            }
            const twist = {
                linear: {
                    x: lx,
                    y: 0,
                    z: 0
                },
                angular: {
                    x: 0,
                    y: 0,
                    z: az
                }
            };
            commandVelocityPublisher.publish(twist);
        } else {
            lx = 0.0;
            az = 0.0;
        }
    }, 50);

    node.subscribe("/turtle1/pose", "turtlesim/Pose", pose => handlePose(pose));
    node.subscribe("/trail_on", "std_msgs/Bool", _ => (trail = true));
    node.subscribe("/trail_off", "std_msgs/Bool", _ => (trail = false));
    node.subscribe("/spin_on", "std_msgs/Bool", _ => (spin = true));
    node.subscribe("/spin_off", "std_msgs/Bool", _ => (spin = false));
};

(async () => {
    try {
        f();
    } catch (e) {
        console.log(e);
    }
})();
